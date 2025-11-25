import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Client, LocalAuth, WAState } from 'whatsapp-web.js';
import * as path from 'path';
import * as fs from 'fs';
import { WhatsAppGateway } from '../whatsapp.gateway';
import { InjectRepository } from '@nestjs/typeorm';
import { WhatsAppSession } from '../../../database/entities/whatsapp-session.entity';
import { Repository } from 'typeorm';
import { Business } from '../../../database/entities/business.entity';

@Injectable()
export class WhatsAppClientManager {
  private readonly logger = new Logger(WhatsAppClientManager.name);
  private clients = new Map<number, Client>();
  private manualDisconnect: Set<number> = new Set();
  private mobileLogout: Set<number> = new Set();

  constructor(
    @InjectRepository(WhatsAppSession)
    private readonly whatsappRepo: Repository<WhatsAppSession>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private gateway: WhatsAppGateway,
  ) {}

  private getSessionPath(businessId: number): string {
    const basePath = path.join(process.cwd(), 'whatsapp-sessions');
    if (!fs.existsSync(basePath)) fs.mkdirSync(basePath, { recursive: true });
    return path.join(basePath, `business_${businessId}`);
  }

  // -----------------------------
  // Create or return WhatsApp client
  // -----------------------------
  async createClient(businessId: number): Promise<{
    status: 'success' | 'error';
    message: string;
    connected: boolean;
    qr?: string;
    client: Client | null;
  }> {
    // Prevent re-init if mobile logout occurred
    if (this.mobileLogout.has(businessId)) {
      return {
        status: 'error',
        message: 'Business logged out from mobile. Manual reconnect required.',
        connected: false,
        client: null,
      };
    }

    // Return existing client if already initialized
    if (this.clients.has(businessId)) {
      const existingClient = this.clients.get(businessId)!;
      const isReady = !!existingClient.info?.wid;
      return {
        status: 'success',
        message: 'Client already exists',
        connected: isReady,
        client: existingClient,
      };
    }

    const sessionPath = this.getSessionPath(businessId);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `business_${businessId}`,
        dataPath: sessionPath,
      }),
      puppeteer: {
        headless: true,
        dumpio: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-extensions',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-software-rasterizer',
        ],
      },
    });

    let currentQR: string | undefined;
    let isConnected = false;

    // -----------------------------
    // QR Event
    // -----------------------------
    client.on('qr', (qr) => {
      currentQR = qr;
      this.logger.log(`📱 QR scan required for Business ${businessId}`);
      this.gateway?.sendQR(businessId, qr);
    });

    // -----------------------------
    // Authenticated Event
    // -----------------------------
    client.on('authenticated', () => {
      this.logger.log(`🔐 Authenticated - Business ${businessId}`);
      this.gateway?.sendAuthenticated(businessId);
    });

    // -----------------------------
    // Ready Event
    // -----------------------------
    client.on('ready', async () => {
      try {
        isConnected = true;
        this.logger.log(`✅ WhatsApp READY - Business ${businessId}`);
        await this.saveSessionStatus(businessId, 'connected');
        this.gateway?.sendReady(businessId);
      } catch (err) {
        this.logger.error(`❌ Error on ready(): ${err}`);
      }
    });

    // -----------------------------
    // Disconnected Event
    // -----------------------------
    client.on('disconnected', async (reason: WAState | 'LOGOUT') => {
      try {
        if (reason === 'LOGOUT') {
          this.logger.warn(`🚫 Mobile logout detected - Business ${businessId}`);
          this.mobileLogout.add(businessId);
          this.logger.warn(
            `⛔ Business ${businessId} logged out from mobile. Manual reconnect required.`,
          );
        } else {
          this.logger.warn(`⚠️ Disconnected - Business ${businessId}, reason: ${reason}`);
        }

        // Safely destroy client
        const existing = this.clients.get(businessId);
        if (existing) await existing.destroy().catch(() => {});
        this.clients.delete(businessId);

        await this.saveSessionStatus(businessId, 'disconnected');
        this.gateway?.sendDisconnected(businessId);

        // Auto-reconnect only if not manual disconnect and not mobile logout
        if (!this.manualDisconnect.has(businessId) && !this.mobileLogout.has(businessId)) {
          this.logger.log(`🔄 Auto-reconnect attempt for Business ${businessId}`);
          setTimeout(() => this.createClient(businessId), 5000);
        }
      } catch (err) {
        this.logger.error(`❌ Error handling disconnect: ${err}`);
      }
    });

    // -----------------------------
    // Initialize client safely
    // -----------------------------
    let retries = 3;
    for (let i = 0; i < retries; i++) {
      try {
        await client.initialize();
        break;
      } catch (err: any) {
        if (err.code === 'EBUSY' && i < retries - 1) {
          this.logger.warn(`EBUSY lock, retrying initialization... (${i + 1})`);
          await new Promise((res) => setTimeout(res, 500));
        } else {
          throw err;
        }
      }
    }

    this.clients.set(businessId, client);

    return {
      status: 'success',
      message: 'Client initialized',
      connected: isConnected,
      qr: currentQR,
      client,
    };
  }

  // -----------------------------
  // Stop client manually
  // -----------------------------
  async stopClient(businessId: number) {
    const client = this.clients.get(businessId);
    if (!client) return;

    try {
      this.manualDisconnect.add(businessId);
      await client.destroy();
      this.logger.log(`🛑 Client stopped for business ${businessId}`);
    } catch (err) {
      this.logger.error(`Error stopping client for business ${businessId}: ${err}`);
    }

    this.clients.delete(businessId);
    this.manualDisconnect.delete(businessId);
  }

  // -----------------------------
  // Manual reconnect after mobile logout
  // -----------------------------
  async reconnectClient(businessId: number) {
    if (!this.mobileLogout.has(businessId)) {
      return { status: 'error', message: 'No mobile logout detected.' };
    }

    this.logger.log(`🔄 Manual reconnect initiated for Business ${businessId}`);
    this.mobileLogout.delete(businessId);

    return this.createClient(businessId);
  }

  // -----------------------------
  // Send WhatsApp message
  // -----------------------------
  async sendMessage(businessId: number, phone: string, message: string) {
    const client = this.clients.get(businessId);
    if (!client || !this.isConnected(businessId)) {
      throw new NotFoundException('WhatsApp client not connected');
    }

    const formattedPhone = phone.includes('@c.us') ? phone : `${phone}@c.us`;

    try {
      await client.sendMessage(formattedPhone, message);
      return { businessId, phone, message, sent: true };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to send message for business ${businessId}: ${errMsg}`);
      return { businessId, phone, message, sent: false, error: errMsg };
    }
  }

  // -----------------------------
  // Check if client is connected
  // -----------------------------
  isConnected(businessId: number): boolean {
    const client = this.clients.get(businessId);
    return !!(client && client.info?.me);
  }

  // -----------------------------
  // Save session status to DB
  // -----------------------------
  async saveSessionStatus(businessId: number, status: string) {
    let session = await this.whatsappRepo.findOne({
      where: { business: { id: businessId } },
      relations: ['business'],
    });

    if (!session) {
      const business = await this.businessRepo.findOneBy({ id: businessId });
      if (!business) throw new Error(`Business with ID ${businessId} not found`);
      session = this.whatsappRepo.create({ business, session_data: status });
    } else {
      session.session_data = status;
    }

    await this.whatsappRepo.save(session);
  }
}
