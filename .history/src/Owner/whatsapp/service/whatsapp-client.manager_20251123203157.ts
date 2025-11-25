import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import * as path from 'path';
import * as fs from 'fs';
import { WhatsAppGateway } from '../whatsapp.gateway';

@Injectable()
export class WhatsAppClientManager {
  constructor(private gateway: WhatsAppGateway) { }

  private readonly logger = new Logger(WhatsAppClientManager.name);
  private clients = new Map<number, Client>();

  private getSessionPath(businessId: number): string {
    const basePath = path.join(process.cwd(), 'whatsapp-sessions');
    if (!fs.existsSync(basePath)) fs.mkdirSync(basePath, { recursive: true });
    return path.join(basePath, `business_${businessId}`);
  }

  async createClient(businessId: number): Promise<Client> {
    if (this.clients.has(businessId)) return this.clients.get(businessId)!;

    const sessionPath = this.getSessionPath(businessId);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `business_${businessId}`,
        dataPath: sessionPath,
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    // Track QR send to avoid multiple pushes
    let qrSent = false;

    client.on('qr', (qr) => {
      if (qrSent) return;
      qrSent = true;

      this.logger.log(`📱 QR එක scan කරන්න Business ${businessId} සදහා`);

      // Send via WebSocket if gateway exists
      if (this.gateway) {
        this.logger.log('✅ Gateway exists, sending QR via WebSocket');
        this.gateway.sendQR(businessId, qr);
      } else {
        this.logger.warn('⚠️ Gateway not found, QR not sent via WebSocket');
      }

      // Print QR in terminal
      qrcode.generate(qr, { small: false });
    });

    client.on('ready', () => {
      this.logger.log(`✅ WhatsApp Client සූදානම් - Business ${businessId}`);
      if (this.gateway) {
        this.logger.log('✅ Gateway exists, sending READY via WebSocket');
        this.gateway.sendReady(businessId);
      } else {
        this.logger.warn('⚠️ Gateway not found, READY not sent via WebSocket');
      }
    });

    client.on('authenticated', () => {
      this.logger.log(`🔐 Login එක සාර්ථකයි - Business ${businessId}`);
      if (this.gateway) {
        this.gateway.sendReady(businessId); // Frontend එකට ready event යවනවා
      }
    });

    client.on('disconnected', () => {
      this.logger.warn(`⚠️ Disconnected - Business ${businessId}`);
      this.clients.delete(businessId);
      if (this.gateway) {
        this.gateway.sendDisconnected(businessId);
      }
    });

    await client.initialize();
    this.clients.set(businessId, client);
    return client;
  }



  async stopClient(businessId: number) {
    const client = this.clients.get(businessId);
    if (!client) return;

    await client.destroy();
    this.clients.delete(businessId);
    this.logger.log(`Client stopped for business ${businessId}`);
  }

  // whatsapp.service.ts
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
      this.logger.error(
        `Failed to send message for business ${businessId}: ${errMsg}`,
      );
      return { businessId, phone, message, sent: false, error: errMsg };
    }
  }

  isConnected(businessId: number): boolean {
    const client = this.clients.get(businessId);
    return !!(client && client.info?.me);
  }
}
