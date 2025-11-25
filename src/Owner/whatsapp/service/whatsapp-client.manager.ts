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
  client: Client;
}> {
  let client: Client;
  let currentQR: string | undefined;
  let isConnected = false;

  // Reuse existing client if available
  if (this.clients.has(businessId)) {
    client = this.clients.get(businessId)!;
    const isReady = !!client.info?.wid;

    if (isReady) {
      return {
        status: 'success',
        message: 'Client already exists',
        connected: true,
        client,
      };
    }

    // Try to reinitialize existing client without deleting
    this.logger.log(`♻️ Reinitializing client for Business ${businessId}`);
    try {
      await client.initialize();
      if (client.info?.wid) {
        isConnected = true;
        await this.saveSessionStatus(businessId, 'connected');
        return {
          status: 'success',
          message: 'Client reconnected',
          connected: true,
          client,
        };
      }
    } catch (err) {
      this.logger.warn(`Failed to reinitialize client, creating new one: ${err}`);
      this.clients.delete(businessId);
    }
  }

  // Create new client if none exists or reinit failed
  client = new Client({
    authStrategy: new LocalAuth({ clientId: `business_${businessId}` }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-infobars',
        '--disable-features=site-per-process',
        '--disable-features=NetworkService',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--mute-audio',
        '--disable-notifications',
      ],
      ignoreHTTPSErrors: true,
    },
    takeoverOnConflict: true,
    restartOnAuthFail: true,
  });

  // Event listeners
  client.on('qr', (qr) => {
    currentQR = qr;
    this.logger.log(`📱 QR scan required for Business ${businessId}`);
    this.gateway?.sendQR(businessId, qr);
  });

  client.on('authenticated', async () => {
    this.logger.log(`🔐 Authenticated - Business ${businessId}`);
    this.gateway?.sendAuthenticated(businessId);
  });

  client.on('ready', async () => {
    isConnected = true;
    this.logger.log(`✅ WhatsApp READY - Business ${businessId}`);
    await this.saveSessionStatus(businessId, 'connected');
    this.gateway?.sendReady(businessId);
  });

  client.on('disconnected', async (reason) => {
    this.logger.warn(`⚠️ WhatsApp disconnected - Business ${businessId}: ${reason}`);
    await this.saveSessionStatus(businessId, 'disconnected');
    this.gateway?.sendDisconnected(businessId);
    this.handleClientReinitialization(client, businessId);
  });

  // Initialize with retry (EBUSY safe)
  for (let i = 0; i < 3; i++) {
    try {
      await client.initialize();
      break;
    } catch (err: any) {
      if (err.code === 'EBUSY' && i < 2) {
        this.logger.warn(`EBUSY initializing client, retry ${i + 1}`);
        await new Promise(res => setTimeout(res, 1000));
      } else {
        return {
          status: 'error',
          message: `Failed to initialize client: ${err.message || err}`,
          connected: false,
          client,
        };
      }
    }
  }

  // Save client in map
  this.clients.set(businessId, client);

  return {
    status: 'success',
    message: 'Client initialized',
    connected: isConnected,
    qr: currentQR,
    client,
  };
}

// Safe reinit on disconnect
async handleClientReinitialization(client: Client, businessId: number) {
  this.logger.log(`♻️ Reinitializing WhatsApp client for Business ${businessId}`);
  try {
    await client.destroy();
  } catch (err) {
    this.logger.warn(`Error destroying client: ${err}`);
  }

  // Short delay to release file locks (important on VPS)
  await new Promise(res => setTimeout(res, 1500));

  // Recreate client
  await this.createClient(businessId);
}

  // Function to reset the client
  async resetClient(client: Client) {
    try {
      // 1. Destroy the current instance (triggers LocalAuth.logout and file cleanup)
      await client.destroy();
      console.log('Whatsapp Client destroyed. Reinitializing...');

      // 2. 💡 ADD A SHORT DELAY HERE to ensure file locks are released
      await new Promise(res => setTimeout(res, 15000)); // Delay for 500ms 

      // 3. Reinitialize the client
      await client.initialize();
    } catch (error) {
      // ... (Error logging)
    }
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
