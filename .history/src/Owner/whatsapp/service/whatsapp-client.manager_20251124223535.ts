import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Client, LocalAuth } from 'whatsapp-web.js';
import * as path from 'path';
import * as fs from 'fs';
import { WhatsAppGateway } from '../whatsapp.gateway';

@Injectable()
export class WhatsAppClientManager {
  private readonly logger = new Logger(WhatsAppClientManager.name);
  private clients = new Map<number, Client>();

  constructor(private gateway: WhatsAppGateway) { }

  private getSessionPath(businessId: number): string {
    const basePath = path.join(process.cwd(), 'whatsapp-sessions');
    if (!fs.existsSync(basePath)) fs.mkdirSync(basePath, { recursive: true });
    return path.join(basePath, `business_${businessId}`);
  }

  // async createClient(businessId: number): Promise<Client> {
  //   if (this.clients.has(businessId)) return this.clients.get(businessId)!;

  //   const sessionPath = this.getSessionPath(businessId);
  //   const client = new Client({
  //     authStrategy: new LocalAuth({ clientId: `business_${businessId}`, dataPath: sessionPath }),
  //     puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  //   });

  //   // QR event
  //   client.on('qr', (qr) => {
  //     this.logger.log(`📱 QR scan required for Business ${businessId}`);
  //     this.gateway?.sendQR(businessId, qr);
  //   });

  //   // Ready event
  //   client.on('ready', () => {
  //     this.logger.log(`✅ WhatsApp Client ready - Business ${businessId}`);
  //     this.gateway?.sendReady(businessId);
  //   });

  //   // Authenticated event
  //   client.on('authenticated', () => {
  //     this.logger.log(`🔐 Login successful - Business ${businessId}`);
  //     this.gateway?.sendAuthenticated(businessId);
  //   });

  //   // Disconnected event
  //   client.on('disconnected', () => {
  //     this.logger.warn(`⚠️ Disconnected - Business ${businessId}`);
  //     this.clients.delete(businessId);
  //     this.gateway?.sendDisconnected(businessId);
  //   });

  //   await client.initialize();
  //   this.clients.set(businessId, client);
  //   return client;
  // }

  async createClient(businessId: number): Promise<{
    status: 'success' | 'error';
    message: string;
    connected: boolean;
    qr?: string;
    client: any
  }> {
    if (this.clients.has(businessId)) {
      const existingClient = this.clients.get(businessId)!;
      const isReady = existingClient.info?.wid ? true : false;
      return {
        status: 'success',
        message: 'Client already exists',
        connected: isReady,
        client: existingClient
      };
    }

    const sessionPath = this.getSessionPath(businessId);
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: `business_${businessId}`, dataPath: sessionPath }),
      puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    });

    let currentQR: string | undefined;
    let isConnected = false;

    client.on('qr', (qr) => {
      currentQR = qr;
      this.logger.log(`📱 QR scan required for Business ${businessId}`);
      this.gateway?.sendQR(businessId, qr);
    });

    client.on('ready', () => {
      isConnected = true;
      this.logger.log(`✅ WhatsApp Client ready - Business ${businessId}`);
      this.gateway?.sendReady(businessId);
    });

    client.on('authenticated', () => {
      this.logger.log(`🔐 Login successful - Business ${businessId}`);
      this.gateway?.sendAuthenticated(businessId);
    });

    client.on('disconnected', () => {
      isConnected = false;
      this.logger.warn(`⚠️ Disconnected - Business ${businessId}`);
      this.clients.delete(businessId);
      this.gateway?.sendDisconnected(businessId);
    });

    await client.initialize();
    this.clients.set(businessId, client);

    return {
      status: 'success',
      message: 'Client initialized',
      connected: isConnected,
      qr: currentQR,
      client: client
    };
  }


  async stopClient(businessId: number) {
    const client = this.clients.get(businessId);
    if (!client) return;

    await client.destroy();
    this.clients.delete(businessId);
    this.logger.log(`🛑 Client stopped for business ${businessId}`);
  }

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

  isConnected(businessId: number): boolean {
    const client = this.clients.get(businessId);
    return !!(client && client.info?.me);
  }
}



// import { Injectable, Logger, NotFoundException } from '@nestjs/common';
// import { Client, LocalAuth } from 'whatsapp-web.js';
// import qrcode from 'qrcode-terminal';
// import * as path from 'path';
// import * as fs from 'fs';
// import { WhatsAppGateway } from '../whatsapp.gateway';

// @Injectable()
// export class WhatsAppClientManager {
//   private readonly logger = new Logger(WhatsAppClientManager.name);

//   private clients = new Map<number, Client>();

//   constructor(private gateway: WhatsAppGateway) {}

//   private getSessionPath(businessId: number): string {
//     const basePath = path.join(process.cwd(), 'whatsapp-sessions');
//     if (!fs.existsSync(basePath)) fs.mkdirSync(basePath, { recursive: true });
//     return path.join(basePath, `business_${businessId}`);
//   }

//   async createClient(businessId: number): Promise<Client> {
//     // prevent multiple instances
//     if (this.clients.has(businessId)) return this.clients.get(businessId)!;

//     const sessionPath = this.getSessionPath(businessId);

//     const client = new Client({
//       authStrategy: new LocalAuth({
//         clientId: `business_${businessId}`,
//         dataPath: sessionPath,
//       }),
//       puppeteer: {
//         headless: true,
//         args: ['--no-sandbox', '--disable-setuid-sandbox'],
//       },
//     });

//     /** QR EVENT */
//     client.on('qr', (qr) => {
//       this.logger.log(`📱 QR එක scan කරන්න Business ${businessId} සදහා`);

//       if (this.gateway) {
//         this.logger.log('📤 WebSocket හරහා QR යවමින්…');
//         this.gateway.sendQR(businessId, qr);
//       }

//       // qrcode.generate(qr, { small: false });
//     });

//     /** READY EVENT */
//     client.on('ready', () => {
//       this.logger.log(`✅ WhatsApp Client සූදානම් - Business ${businessId}`);

//       if (this.gateway) {
//         this.gateway.sendReady(businessId);
//       }
//     });

//     /** AUTH SUCCESS */
//     client.on('authenticated', () => {
//       this.logger.log(`🔐 Login සාර්ථකයි - Business ${businessId}`);
//       if (this.gateway) {
//         this.gateway.sendAuthenticated(businessId);
//       }
//     });

//     /** DISCONNECTED EVENT */
//     client.on('disconnected', () => {
//       this.logger.warn(`⚠️ Disconnected - Business ${businessId}`);
//       this.clients.delete(businessId);

//       if (this.gateway) {
//         this.gateway.sendDisconnected(businessId);
//       }
//     });

//     /** START CLIENT */
//     await client.initialize();
//     this.clients.set(businessId, client);

//     return client;
//   }

//   /** Stop a client and cleanup */
//   async stopClient(businessId: number) {
//     const client = this.clients.get(businessId);
//     if (!client) return;

//     await client.destroy();
//     this.clients.delete(businessId);

//     this.logger.log(`🛑 Client stopped for business ${businessId}`);
//   }

//   /** Send WhatsApp message */
//   async sendMessage(businessId: number, phone: string, message: string) {
//     const client = this.clients.get(businessId);

//     if (!client || !this.isConnected(businessId)) {
//       throw new NotFoundException('WhatsApp client not connected');
//     }

//     const formattedPhone = phone.includes('@c.us') ? phone : `${phone}@c.us`;

//     try {
//       await client.sendMessage(formattedPhone, message);
//       return { businessId, phone, message, sent: true };
//     } catch (error: unknown) {
//       const errMsg = error instanceof Error ? error.message : String(error);

//       this.logger.error(
//         `❌ Failed to send message for business ${businessId}: ${errMsg}`,
//       );

//       return { businessId, phone, message, sent: false, error: errMsg };
//     }
//   }

//   /** Check if client is ready */
//   isConnected(businessId: number): boolean {
//     const client = this.clients.get(businessId);
//     return !!(client && client.info?.me);
//   }
// }
