import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Client, LocalAuth } from 'whatsapp-web.js';
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

  constructor
    (
      @InjectRepository(WhatsAppSession)
      private readonly whatsappRepo: Repository<WhatsAppSession>,
      @InjectRepository(Business)
      private readonly businessRepo: Repository<Business>,
      private gateway: WhatsAppGateway
    ) { }

  private getSessionPath(businessId: number): string {
    const basePath = path.join(process.cwd(), 'whatsapp-sessions');
    if (!fs.existsSync(basePath)) fs.mkdirSync(basePath, { recursive: true });
    return path.join(basePath, `business_${businessId}`);
  }


  async createClient(businessId: number): Promise<{
    status: 'success' | 'error';
    message: string;
    connected: boolean;
    qr?: string;
    client: any;
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
        ]
      },

      // puppeteer: {
      //   headless: true,
      //   args: ['--no-sandbox', '--disable-setuid-sandbox']
      // },
    });

    let currentQR: string | undefined;
    let isConnected = false;

    // QR event
    client.on('qr', (qr) => {
      currentQR = qr;
      this.logger.log(`📱 QR scan required for Business ${businessId}`);
      this.gateway?.sendQR(businessId, qr); // only QR, not connected
    });

    // authenticated
    client.on('authenticated', () => {
      this.logger.log(`🔐 Authenticated - Business ${businessId}`);
      this.gateway?.sendAuthenticated(businessId);
    });

    // ready = fully connected
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

    // disconnected
    client.on('disconnected', async () => {
      try {
        this.logger.warn(`⚠️ Disconnected - Business ${businessId}`);

        // // Do NOT close browser manually
        // await client.destroy().catch(() => { });

        // this.clients.delete(businessId);

        await this.saveSessionStatus(businessId, 'disconnected');

        this.gateway?.sendDisconnected(businessId);

      } catch (err) {
        this.logger.error(`❌ Error handling disconnect: ${err}`);
      }
    });



    // Initialize safely (avoid EBUSY)
    let retries = 3;
    for (let i = 0; i < retries; i++) {
      try {
        await client.initialize();
        break;
      } catch (err: any) {
        if (err.code === 'EBUSY' && i < retries - 1) {
          this.logger.warn(`EBUSY lock, retrying initialization... (${i + 1})`);
          await new Promise(res => setTimeout(res, 500));
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



  async stopClient(businessId: number) {
    const client = this.clients.get(businessId);
    if (!client) return;

    try {
      await client.destroy();
      this.logger.log(`🛑 Client stopped for business ${businessId}`);
    } catch (err) {
      this.logger.error(`Error stopping client for business ${businessId}: ${err}`);
    }

    this.clients.delete(businessId);

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
