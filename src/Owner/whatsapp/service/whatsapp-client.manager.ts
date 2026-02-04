import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import { WhatsAppGateway } from '../whatsapp.gateway';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppSession } from '../../../database/entities/whatsapp-session.entity';
import { Business } from '../../../database/entities/business.entity';
import * as fs from 'fs';
import * as path from 'path';
import { Boom } from '@hapi/boom';
import { WhatsAppMessageHandler } from './whatsapp-message.handler';
import { MessageHandlerServiceAdvance } from './whatsapp-message.handler-advance';

@Injectable()
export class WhatsAppClientManager {
  private readonly logger = new Logger(WhatsAppClientManager.name);

  private clients = new Map<number, WASocket>();
  private connected = new Set<number>();
  private keepAliveIntervals = new Map<number, NodeJS.Timeout>();

  constructor(
    @InjectRepository(WhatsAppSession)
    private readonly whatsappRepo: Repository<WhatsAppSession>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly gateway: WhatsAppGateway,
    private readonly messageHandler: WhatsAppMessageHandler,
    private readonly messageHandlerService: MessageHandlerServiceAdvance,
  ) {}

  /* ---------------------------------- */
  /* Connection helpers                 */
  /* ---------------------------------- */

  isConnected(businessId: number): boolean {
    return this.connected.has(businessId);
  }

  getClient(businessId: number): WASocket | null {
    return this.clients.get(businessId) || null;
  }

  hasAuthFiles(businessId: number): boolean {
    const dir = this.getSessionDir(businessId);
    const creds = path.join(dir, 'creds.json');
    return fs.existsSync(dir) && fs.existsSync(creds);
  }

  /* ---------------------------------- */
  /* Create / Init Client               */
  /* ---------------------------------- */

  async createClient(
    businessId: number,
    phoneNumber: string,
  ): Promise<WASocket> {
    await this.cleanupSessionDirectory(businessId);

    if (this.clients.has(businessId)) {
      const existingClient = this.clients.get(businessId);
      if (existingClient) {
        await this.stopClient(businessId);
      }
    }

    const sessionDir = this.getSessionDir(businessId);

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: true,
    });

    sock.ev.on('creds.update', saveCreds);
    // this.bindMessageListener(businessId, sock);
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.gateway.sendQR(businessId, qr);
      }

      if (connection === 'open') {
        this.logger.log(`✅ Connected: Business ${businessId}`);

        // Mark client as connected
        this.clients.set(businessId, sock);
        this.connected.add(businessId);

        // Update DB
        await this.saveSessionStatus(businessId, 'connected');

        // Notify gateway
        this.gateway.sendAuthenticated?.(businessId); // 🔒 optional chaining in case undefined
        this.gateway.sendReady?.(businessId);

        this.bindMessageListener(businessId, sock);

        // 🔥 STEP 2: start keep alive
        this.startKeepAlive(businessId, sock);

        return;
      }

      if (connection === 'close') {
        this.stopKeepAlive(businessId);

        const statusCode =
          this.getStatusCode(lastDisconnect?.error) ??
          DisconnectReason.connectionLost;

        // 🔹 Handle first-time pairing disconnect (temporary 515)
        if (statusCode === 515) {
          this.logger.log(
            `⚠️ Temporary stream error 515 (first-time pairing), waiting for reconnect...`,
          );

          this.gateway.sendConnecting?.(businessId);
          // 🔹 Normal disconnect flow
          this.connected.delete(businessId);
          this.clients.delete(businessId);

          this.logger.warn(
            `⚠️ Disconnected business ${businessId} (code: ${statusCode})`,
          );
          await this.saveSessionStatus(businessId, 'disconnected');
          setTimeout(() => {
            this.logger.log(
              `🔄 Reconnecting business ${businessId} after 515 error...`,
            );
            this.createClient(businessId, phoneNumber);
          }, 3000);

          return;
        }

        // 🔹 Normal disconnect flow
        this.connected.delete(businessId);
        this.clients.delete(businessId);

        this.logger.warn(
          `⚠️ Disconnected business ${businessId} (code: ${statusCode})`,
        );
        await this.saveSessionStatus(businessId, 'disconnected');
        this.gateway.sendDisconnected?.(businessId);

        // Handle auth invalid
        if (statusCode === 401) {
          this.logger.error(`🚫 Session expired for ${businessId}`);
          await this.cleanSessionFiles(businessId);
          return;
        }

        // Reconnect on temporary disconnects
        if (
          statusCode === DisconnectReason.restartRequired ||
          statusCode === DisconnectReason.connectionLost ||
          statusCode === DisconnectReason.timedOut
        ) {
          setTimeout(() => {
            this.logger.log(`🔄 Reconnecting business ${businessId}...`);
            this.createClient(businessId, phoneNumber);
          }, 5000);
        }
      }
    });

    this.clients.set(businessId, sock);
    return sock;
  }

  private startKeepAlive(businessId: number, sock: WASocket) {
    this.stopKeepAlive(businessId);

    const interval = setInterval(async () => {
      try {
        if (!this.connected.has(businessId)) return;

        // 💓 wakes WhatsApp event stream
        await sock.sendPresenceUpdate('available');

        this.logger.debug(`💓 Keep-alive OK: ${businessId}`);
      } catch (err) {
        this.logger.warn(`⚠️ Keep-alive failed: ${businessId}`);

        this.stopKeepAlive(businessId);
        this.connected.delete(businessId);
        this.clients.delete(businessId);

        // auto-recover
        this.createClient(businessId, '');
      }
    }, 45_000); // every 45 seconds

    this.keepAliveIntervals.set(businessId, interval);
  }

  /* ---------------------------------- */
  /* Stop Client                        */
  /* ---------------------------------- */

  async stopClient(businessId: number) {
    this.stopKeepAlive(businessId);

    const client = this.clients.get(businessId);
    if (!client) return;

    try {
      client.end?.(undefined);

    } catch(err) {
      this.logger.error(`❌ Failed to end client: ${err}`);
    }

    this.clients.delete(businessId);
    this.connected.delete(businessId);

    await this.saveSessionStatus(businessId, 'disconnected');
    this.logger.log(`🛑 Client stopped for business ${businessId}`);
  }

  /* ---------------------------------- */
  /* Send Message                       */
  /* ---------------------------------- */

  async sendMessage(businessId: number, phone: string, message: string) {
    const client = this.clients.get(businessId);

    if (!client || !this.isConnected(businessId)) {
      throw new NotFoundException('WhatsApp client not connected');
    }

    const jid =
      phone.includes('@s.whatsapp.net') || phone.includes('@c.us')
        ? phone
        : `${phone}@c.us`;

    try {
      await client.sendMessage(jid, { text: message });
      return { businessId, phone, message, sent: true };
    } catch (err: any) {
      const error = err?.message || String(err);
      this.logger.error(`❌ Send failed: ${error}`);
      return { businessId, phone, message, sent: false, error };
    }
  }

  /* ---------------------------------- */
  /* DB Helpers                         */
  /* ---------------------------------- */

  async saveSessionStatus(businessId: number, status: string) {
    let session = await this.whatsappRepo.findOne({
      where: { business: { id: businessId } },
      relations: ['business'],
    });

    if (!session) {
      const business = await this.businessRepo.findOneBy({ id: businessId });
      if (!business) return;
      session = this.whatsappRepo.create({ business, session_data: status });
    } else {
      session.session_data = status;
    }

    await this.whatsappRepo.save(session);
  }

  /* ---------------------------------- */
  /* Session Cleanup                    */
  /* ---------------------------------- */

  private stopKeepAlive(businessId: number) {
    const interval = this.keepAliveIntervals.get(businessId);
    if (interval) {
      clearInterval(interval);
      this.keepAliveIntervals.delete(businessId);
    }
  }

  private getSessionDir(businessId: number): string {
    return path.join(
      process.cwd(),
      'whatsapp-sessions',
      `business-${businessId}`,
    );
  }

  private async cleanSessionFiles(businessId: number) {
    try {
      const sessionDir = this.getSessionDir(businessId);

      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        this.logger.warn(`🧹 Session cleared for business ${businessId}`);
      }

      this.connected.delete(businessId);
      this.clients.delete(businessId);

      await this.saveSessionStatus(businessId, 'session_expired');
    } catch (err) {
      this.logger.error(`❌ Failed cleaning session: ${err}`);
    }
  }

  private getStatusCode(error: unknown): number | undefined {
    if (!error) return undefined;

    if (error instanceof Boom) {
      return error.output?.statusCode;
    }

    return undefined;
  }

  /** Bind incoming message listener */
  private bindMessageListener(businessId: number, client: any) {
    // 🔒 prevent duplicate listeners
    client.ev.removeAllListeners('messages.upsert');

    client.ev.on('messages.upsert', async (m: any) => {
      const messages = m?.messages || [];

      for (const msg of messages) {
        // ❌ invalid or self messages
        if (!msg || msg.key?.fromMe) continue;

        const remoteJid = msg.key?.remoteJid || '';

        // ❌ Ignore GROUP messages
        if (remoteJid.endsWith('@g.us')) continue;

        // ❌ Ignore STATUS / BROADCAST
        if (remoteJid === 'status@broadcast') continue;

        // ❌ Ignore system / empty messages
        if (!msg.message) continue;

        // ❌ Ignore protocol / retry / reaction junk
        const msgKeys = Object.keys(msg.message);
        if (
          msgKeys.includes('protocolMessage') ||
          msgKeys.includes('reactionMessage') ||
          msgKeys.includes('senderKeyDistributionMessage')
        ) {
          continue;
        }

        try {
          const isText = this.isTextMessage(msg);
          const isImage = this.isImageMessage(msg);

          // ❌ ignore unsupported message types
          if (!isText && !isImage) continue;

          const text = isText ? this.extractText(msg) : null;

          const from = remoteJid;
          const name = msg.pushName || 'Unknown';
          const messageType = this.getMessageType(msg);

          this.logger.log(
            `📩 [${businessId}] ${name} (${messageType}): ${text ?? '[image]'}`,
          );

          await this.messageHandler.handleIncomingMessage(
            client,
            businessId,
            from,
            name,
            text ?? '', // 🔒 SAFE
            msg,
          );
        } catch (err) {
          this.logger.error(`❌ Message handling error`, err);
        }
      }
    });
  }

  private isTextMessage(msg: any): boolean {
    return !!(
      msg.message?.conversation || msg.message?.extendedTextMessage?.text
    );
  }

  private isImageMessage(msg: any): boolean {
    return !!msg.message?.imageMessage;
  }

  /** Extract text safely from any message */
  private extractText(msg: any): string {
    const message = msg?.message;
    if (!message) return '';

    if (message.conversation) return message.conversation.trim();

    if (message.extendedTextMessage?.text)
      return message.extendedTextMessage.text.trim();

    if (message.buttonsResponseMessage?.selectedButtonId)
      return message.buttonsResponseMessage.selectedButtonId;

    if (message.listResponseMessage?.title)
      return message.listResponseMessage.title;

    if (message.imageMessage?.caption)
      return message.imageMessage.caption.trim();

    if (message.videoMessage?.caption)
      return message.videoMessage.caption.trim();

    if (message.documentMessage?.caption)
      return message.documentMessage.caption.trim();

    return '';
  }

  /** Detect message type */
  private getMessageType(msg: any): string {
    const message = msg?.message;
    if (!message) return 'unknown';
    const keys = Object.keys(message);
    return keys.length ? keys[0] : 'unknown';
  }

  private async cleanupSessionDirectory(businessId: number): Promise<void> {
    try {
      const sessionDir = this.getSessionDir(businessId);

      if (!fs.existsSync(sessionDir)) {
        return;
      }

      const files = fs.readdirSync(sessionDir);

      // 🔥 KEEP ONLY ESSENTIAL FILES
      const essentialFiles = [
        'creds.json', // Authentication file (MUST KEEP)
        // Keep only latest pre-keys (last 100)
        ...files.filter((f) => f.startsWith('pre-key-')).slice(-100),
        // Keep only latest session
        ...this.getLatestSessionFile(files),
        // Keep token files
        ...files.filter((f) => f.startsWith('tctoken-')),
      ];

      // DELETE ALL OTHER FILES
      files.forEach((file) => {
        if (!essentialFiles.includes(file)) {
          const filePath = path.join(sessionDir, file);
          fs.unlinkSync(filePath);
          this.logger.debug(`🧹 Deleted old file: ${file}`);
        }
      });

      this.logger.log(
        `✅ Cleaned session directory for business ${businessId}`,
      );

      // 🔥 CLEANUP EMPTY PRE-KEYS (optional)
      this.cleanupExcessPreKeys(businessId);
    } catch (error) {
      this.logger.error(`❌ Failed to cleanup session directory: ${error}`);
    }
  }

  private getLatestSessionFile(files: string[]): string[] {
    const sessionFiles = files.filter((f) => f.startsWith('session-'));
    if (sessionFiles.length === 0) return [];

    // Find latest session by version number
    let latestFile = '';
    let latestVersion = 0;

    sessionFiles.forEach((file) => {
      const match = file.match(/session-[^_]+_(\d+\.\d+)\.json/);
      if (match) {
        const version = parseFloat(match[1]);
        if (version > latestVersion) {
          latestVersion = version;
          latestFile = file;
        }
      }
    });

    return latestFile ? [latestFile] : [];
  }

  private cleanupExcessPreKeys(businessId: number): void {
    try {
      const sessionDir = this.getSessionDir(businessId);

      if (!fs.existsSync(sessionDir)) return;

      const files = fs.readdirSync(sessionDir);
      const preKeyFiles = files.filter((f) => f.startsWith('pre-key-')).sort();

      // Keep only last 100 pre-keys (WhatsApp default)
      if (preKeyFiles.length > 100) {
        const filesToDelete = preKeyFiles.slice(0, preKeyFiles.length - 100);

        filesToDelete.forEach((file) => {
          const filePath = path.join(sessionDir, file);
          fs.unlinkSync(filePath);
        });

        this.logger.debug(`🗑️ Deleted ${filesToDelete.length} excess pre-keys`);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to cleanup pre-keys: ${error}`);
    }
  }
}
