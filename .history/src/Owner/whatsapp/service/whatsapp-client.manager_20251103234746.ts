import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class WhatsAppClientManager {
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
        dataPath: sessionPath, // 🔥 මෙතනයි session data save වෙන්නේ
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    client.on('qr', (qr) => {
      this.logger.log(`📱 QR එක scan කරන්න Business ${businessId} සදහා`);
      qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
      this.logger.log(`✅ WhatsApp Client සූදානම් - Business ${businessId}`);
    });

    client.on('authenticated', () => {
      this.logger.log(`🔐 Login එක සාර්ථකයි - Business ${businessId}`);
    });

    client.on('disconnected', () => {
      this.logger.warn(`⚠️ Disconnected - Business ${businessId}`);
      this.clients.delete(businessId);
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
