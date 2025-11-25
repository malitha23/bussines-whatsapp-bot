import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppSession } from '../../database/entities/whatsapp-session.entity';
import { Business } from '../../database/entities/business.entity';
import { WhatsAppClientManager } from './service/whatsapp-client.manager';
import { WhatsAppMessageHandler } from './service/whatsapp-message.handler';
import { Client } from 'whatsapp-web.js';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    @InjectRepository(WhatsAppSession)
    private readonly whatsappRepo: Repository<WhatsAppSession>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly clientManager: WhatsAppClientManager,
    private readonly messageHandler: WhatsAppMessageHandler,
  ) { }

  async initClient(businessId: number, ownerId: number) {
    const business = await this.businessRepo.findOne({
      where: { id: businessId, owner: { id: ownerId } },
    });

    if (!business)
      throw new NotFoundException('Business not found or not owned by you');

    const clientResult = await this.clientManager.createClient(businessId); // Get structured response

    const client: Client = clientResult.client;

    // Bind message listener
    client.removeAllListeners('message');
    client.on('message', (msg) => {
      (async () => {
        try {
          const contact = await msg.getContact();
          const name = contact.pushname || contact.name || contact.number;
          const text = msg.body?.trim();
          await this.messageHandler.handleIncomingMessage(
            client,
            businessId,
            msg.from,
            name,
            text,
            msg,
          );
        } catch (err) {
          this.logger.error(`Message handling error: ${err}`);
        }
      })();
    });

    // Bind disconnected listener
    client.removeAllListeners('disconnected');
    client.on('disconnected', () => {
      (async () => {
        await this.clientManager.stopClient(businessId);
        await this.saveSessionStatus(businessId, 'disconnected');
      })();
    });

    await this.saveSessionStatus(businessId, clientResult.connected ? 'connected' : 'disconnected');

    this.logger.log(`✅ Client manually initialized for Business ID: ${businessId}`);

    return {
      status: 'success',
      message: 'Client initialized',
      connected: clientResult.connected,
      qr: clientResult.qr || null,
    };
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



// import {
//   Injectable,
//   NotFoundException,
//   OnModuleInit,
//   Logger,
// } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { WhatsAppSession } from '../../database/entities/whatsapp-session.entity';
// import { Business } from '../../database/entities/business.entity';
// import { WhatsAppClientManager } from './service/whatsapp-client.manager';
// import { WhatsAppMessageHandler } from './service/whatsapp-message.handler';

// @Injectable()
// export class WhatsAppService implements OnModuleInit {
//   private readonly logger = new Logger(WhatsAppService.name);

//   constructor(
//     @InjectRepository(WhatsAppSession)
//     private readonly whatsappRepo: Repository<WhatsAppSession>,
//     @InjectRepository(Business)
//     private readonly businessRepo: Repository<Business>,
//     private readonly clientManager: WhatsAppClientManager,
//     private readonly messageHandler: WhatsAppMessageHandler,
//   ) {}

//   /**
//    * Auto-reconnect clients when the server restarts
//    */
//   async onModuleInit() {
//     // this.logger.log('🔄 Checking for previously connected WhatsApp clients...');
//     // const sessions = await this.whatsappRepo.find({
//     //   relations: ['business'],
//     //   where: { session_data: 'connected' },
//     // });

//     // if (!sessions.length) {
//     //   this.logger.log('⚠️ No previously connected sessions found.');
//     //   return;
//     // }

//     // for (const session of sessions) {
//     //   const businessId = session.business.id;
//     //   try {
//     //     this.logger.log(
//     //       `📲 Auto-connecting WhatsApp client for Business ID: ${businessId}...`,
//     //     );
//     //     const client = await this.clientManager.createClient(businessId);

//     //     // === Bind message listener ===
//     //     // eslint-disable-next-line @typescript-eslint/no-misused-promises
//     //     client.on('message', async (msg) => {
//     //       const contact = await msg.getContact();
//     //       const name = contact.pushname || contact.name || contact.number;
//     //       const text = msg.body?.trim();

//     //       await this.messageHandler.handleIncomingMessage(
//     //         client,
//     //         businessId,
//     //         msg.from,
//     //         name,
//     //         text,
//     //         msg
//     //       );
//     //     });

//     //     // eslint-disable-next-line @typescript-eslint/no-misused-promises
//     //     client.on('disconnected', async () => {
//     //       await this.clientManager.stopClient(businessId);
//     //       await this.saveSessionStatus(businessId, 'disconnected');
//     //     });

//     //     this.logger.log(
//     //       `✅ WhatsApp client for Business ID ${businessId} connected successfully!`,
//     //     );
//     //   } catch (err) {
//     //     if (err instanceof Error) {
//     //       this.logger.error(
//     //         `❌ Failed to reconnect Business ID ${businessId}: ${err.message}`,
//     //       );
//     //     } else {
//     //       this.logger.error(
//     //         `❌ Failed to reconnect Business ID ${businessId}: ${String(err)}`,
//     //       );
//     //     }
//     //     await this.saveSessionStatus(businessId, 'disconnected');
//     //   }
//     // }
//   }

//   /**
//    * Manual connection by business owner
//    */
//   async initClient(businessId: number, ownerId: number) {
//     const business = await this.businessRepo.findOne({
//       where: { id: businessId, owner: { id: ownerId } },
//     });

//     if (!business)
//       throw new NotFoundException('Business not found or not owned by you');

//     const client = await this.clientManager.createClient(businessId);

//     // eslint-disable-next-line @typescript-eslint/no-misused-promises
//     client.on('message', async (msg) => {
//       const contact = await msg.getContact();
//       const name = contact.pushname || contact.name || contact.number;
//       const text = msg.body?.trim();

//       await this.messageHandler.handleIncomingMessage(
//         client,
//         businessId,
//         msg.from,
//         name,
//         text,
//         msg
//       );
//     });

//     // eslint-disable-next-line @typescript-eslint/no-misused-promises
//     client.on('disconnected', async () => {
//       await this.clientManager.stopClient(businessId);
//       await this.saveSessionStatus(businessId, 'disconnected');
//     });

//     await this.saveSessionStatus(businessId, 'connected');
//     this.logger.log(
//       `✅ Client manually initialized for Business ID: ${businessId}`,
//     );
//     return { status: 'success', message: 'Client initialized' };
//   }

//   /**
//    * Save or update session connection status
//    */
//   async saveSessionStatus(businessId: number, status: string) {
//     let session = await this.whatsappRepo.findOne({
//       where: { business: { id: businessId } },
//       relations: ['business'],
//     });

//     if (!session) {
//       const business = await this.businessRepo.findOneBy({ id: businessId });
//       if (!business) {
//         throw new Error(`Business with ID ${businessId} not found`);
//       }

//       session = this.whatsappRepo.create({
//         business,
//         session_data: status,
//       });
//     } else {
//       session.session_data = status;
//     }

//     await this.whatsappRepo.save(session);
//   }
// }
