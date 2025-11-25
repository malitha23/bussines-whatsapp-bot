import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { Client, RemoteAuth } from 'whatsapp-web.js';
import * as path from 'path';
import * as fs from 'fs';
import { WhatsAppGateway } from '../whatsapp.gateway';
import { InjectRepository } from '@nestjs/typeorm';
import { WhatsAppSession } from '../../../database/entities/whatsapp-session.entity';
import { Repository } from 'typeorm';
import { Business } from '../../../database/entities/business.entity';
import { createClient } from 'redis';
import { RedisClientType } from 'redis';

// Correct Store interface that matches whatsapp-web.js expectations
interface Store {
  sessionExists: (options: { session: string }) => Promise<boolean>;
  extract: (options: { session: string }) => Promise<any>;
  save: (options: { session: string; data: any }) => Promise<void>;
  delete: (options: { session: string }) => Promise<void>;
}

export class RedisStore implements Store {
  private client: RedisClientType;
  private prefix: string;

  constructor(client: RedisClientType, prefix: string = 'wwebjs:') {
    this.client = client;
    this.prefix = prefix;
  }

  async sessionExists(options: { session: string }): Promise<boolean> {
    try {
      const exists = await this.client.exists(this.prefix + options.session);
      return exists === 1;
    } catch (error) {
      throw new Error(`Redis error checking session existence: ${error}`);
    }
  }

  async extract(options: { session: string }): Promise<any> {
    try {
      const value = await this.client.get(this.prefix + options.session);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      throw new Error(`Redis error extracting session: ${error}`);
    }
  }

  async save(options: { session: string }): Promise<void> {
    try {
      // මෙතන session ID එක track කරන්න පුළුවන්
      // whatsapp-web.js internally session data manage කරයි
      console.log(`Session being managed: ${options.session}`);

      // අවශ්‍ය නම් metadata store කරන්න
      await this.client.setEx(
        this.prefix + 'metadata:' + options.session,
        86400,
        JSON.stringify({
          sessionId: options.session,
          lastAccessed: new Date().toISOString()
        })
      );
    } catch (error: any) {
      console.error('Redis save error:', error);
    }
  }

  async delete(options: { session: string }): Promise<void> {
    try {
      await this.client.del(this.prefix + options.session);
    } catch (error) {
      throw new Error(`Redis error deleting session: ${error}`);
    }
  }
}

@Injectable()
export class WhatsAppClientManager implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppClientManager.name);
  private clients = new Map<number, Client>();
  private redisClient!: RedisClientType;

  constructor(
    @InjectRepository(WhatsAppSession)
    private readonly whatsappRepo: Repository<WhatsAppSession>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private gateway: WhatsAppGateway
  ) {
    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      });

      this.redisClient.on('error', (err) => {
        this.logger.error('Redis Client Error:', err);
      });

      this.redisClient.on('connect', () => {
        this.logger.log('Redis Client Connected');
      });

      await this.redisClient.connect();
    } catch (error) {
      this.logger.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  private getSessionPath(businessId: number): string {
    const basePath = path.join(process.cwd(), 'whatsapp-sessions');
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true });
    }
    return path.join(basePath, `business_${businessId}`);
  }

  async createClient(businessId: number): Promise<{
    status: 'success' | 'error';
    message: string;
    connected: boolean;
    qr?: string;
    client: Client;
  }> {
    if (this.clients.has(businessId)) {
      const existingClient = this.clients.get(businessId)!;
      const isReady = !!existingClient.info?.wid;
      return {
        status: 'success',
        message: 'Client already exists',
        connected: isReady,
        client: existingClient
      };
    }

    // Ensure Redis client is ready
    if (!this.redisClient || !this.redisClient.isOpen) {
      await this.initializeRedis();
    }

    let isConnected = false;
    let currentQR: string | undefined;

    try {
      // Create the Redis store instance
      const redisStore = new RedisStore(this.redisClient, `business_${businessId}:`);

      const client = new Client({
        authStrategy: new RemoteAuth({
          store: redisStore,
          backupSyncIntervalMs: 30000,
          clientId: `business_${businessId}`,
        }),
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
        this.logger.warn(`⚠️ WhatsApp client disconnected for Business ${businessId}: ${reason}`);
        await this.saveSessionStatus(businessId, 'disconnected');
        this.gateway?.sendDisconnected(businessId);

        try {
          await client.destroy();
        } catch (error) {
          this.logger.error(`Error destroying client: ${error}`);
        }

        this.clients.delete(businessId);

        // Recreate client after delay
        setTimeout(() => {
          this.createClient(businessId).catch(err => {
            this.logger.error(`Failed to recreate client: ${err.message}`);
          });
        }, 5000);
      });

      client.on('auth_failure', (error) => {
        this.logger.error(`❌ Authentication failed for Business ${businessId}: ${error}`);
        // this.gateway?.sendAuthFailure(businessId, error);
      });

      // Initialize client with retry logic
      let initializationError: Error | null = null;

      for (let i = 0; i < 3; i++) {
        try {
          await client.initialize();
          initializationError = null;
          break;
        } catch (err: any) {
          initializationError = err;
          if (err.message?.includes('EBUSY') && i < 2) {
            this.logger.warn(`EBUSY initializing client, retry ${i + 1}`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          } else {
            break;
          }
        }
      }

      if (initializationError) {
        return {
          status: 'error',
          message: `Failed to initialize client: ${initializationError.message}`,
          connected: false,
          client,
        };
      }

      this.clients.set(businessId, client);

      return {
        status: 'success',
        message: 'Client initialized successfully',
        connected: isConnected,
        qr: currentQR,
        client,
      };

    } catch (error) {
      this.logger.error(`Failed to create client for business ${businessId}: ${error}`);
      return {
        status: 'error',
        message: `Client creation failed: ${error}`,
        connected: false,
        client: null as any,
      };
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
    await this.saveSessionStatus(businessId, 'disconnected');
  }

  async sendMessage(businessId: number, phone: string, message: string) {
    const client = this.clients.get(businessId);
    if (!client || !this.isConnected(businessId)) {
      throw new NotFoundException('WhatsApp client not connected');
    }

    const formattedPhone = phone.includes('@c.us') ? phone : `${phone}@c.us`;

    try {
      const result = await client.sendMessage(formattedPhone, message);
      return {
        businessId,
        phone: formattedPhone,
        message,
        sent: true,
        messageId: result.id._serialized
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to send message for business ${businessId}: ${errMsg}`);
      return {
        businessId,
        phone: formattedPhone,
        message,
        sent: false,
        error: errMsg
      };
    }
  }

  isConnected(businessId: number): boolean {
    const client = this.clients.get(businessId);
    return !!(client && client.info && client.info.wid);
  }

  async saveSessionStatus(businessId: number, status: string) {
    try {
      let session = await this.whatsappRepo.findOne({
        where: { business: { id: businessId } },
        relations: ['business'],
      });

      if (!session) {
        const business = await this.businessRepo.findOneBy({ id: businessId });
        if (!business) {
          throw new Error(`Business with ID ${businessId} not found`);
        }

        session = this.whatsappRepo.create({
          business,
          session_data: status
        });
      } else {
        session.session_data = status;
      }

      await this.whatsappRepo.save(session);
      this.logger.log(`Session status saved for business ${businessId}: ${status}`);
    } catch (error) {
      this.logger.error(`Failed to save session status for business ${businessId}: ${error}`);
    }
  }

  async onModuleDestroy() {
    // Cleanup all clients and Redis connection
    for (const [businessId, client] of this.clients.entries()) {
      try {
        await client.destroy();
      } catch (error) {
        this.logger.error(`Error destroying client for business ${businessId}: ${error}`);
      }
    }

    if (this.redisClient && this.redisClient.isOpen) {
      await this.redisClient.quit();
    }
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
