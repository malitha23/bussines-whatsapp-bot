import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../../database/entities/business.entity';
import { WhatsAppSession } from '../../database/entities/whatsapp-session.entity';
import { WhatsAppClientManager } from './service/whatsapp-client.manager';


@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(WhatsAppSession)
    private readonly whatsappRepo: Repository<WhatsAppSession>,
    private readonly clientManager: WhatsAppClientManager,
  ) {}

  /** Auto-connect all previously connected clients */
  async onModuleInit() {
    this.logger.log('🔄 Checking for previously connected WhatsApp clients...');

    const sessions = await this.whatsappRepo.find({
      relations: ['business'],
      where: { session_data: 'connected' },
    });

    if (!sessions.length) {
      this.logger.log('⚠️ No previously connected sessions found.');
      return;
    }

    for (const session of sessions) {
      const businessId = session.business?.id;
      const phone = session.business?.phone || '';

      if (!businessId) continue;

      try {
        if (this.clientManager.isConnected(businessId)) {
          this.logger.log(`✅ Business ${businessId} already connected`);
          continue;
        }

        // 🔒 only reconnect if auth files exist
        if (!this.clientManager.hasAuthFiles(businessId)) {
          this.logger.warn(`🚫 No auth files for Business ${businessId}, skipping auto-connect`);
          await this.clientManager.saveSessionStatus(businessId, 'disconnected');
          continue;
        }

        this.logger.log(`📲 Auto-connecting Business ${businessId}`);
        await this.clientManager.createClient(
  businessId,
  phone
);

        
      } catch (err) {
        this.logger.error(`❌ Auto-connect failed for Business ${businessId}`, err);
        await this.clientManager.saveSessionStatus(businessId, 'disconnected');
      }
    }
  }

  /** Initialize client manually by owner */
  async initClient(businessId: number, ownerId: number) {
    const business = await this.businessRepo.findOne({
      where: { id: businessId, owner: { id: ownerId } },
    });

    if (!business) {
      throw new NotFoundException('Business not found or not owned by you ');
    }

    const session = await this.whatsappRepo.findOne({
    relations: ['business'],
    where: { business: { id: businessId } },
  });

  // Check if it is already connected
  if (session?.session_data === 'connected' && this.clientManager.isConnected(businessId)) {
    return {
      status: 'success',
      message: 'Client already connected',
      connected: true,
      qr: null,
    };
  }

    await this.clientManager.createClient(
  businessId,
  business.phone || ''
);


    return {
      status: 'success',
      message: 'Client initialized',
      connected: false,
      qr: null,
    };
  }

 

  /** Send message */
  async sendMessage(businessId: number, phone: string, message: string) {
    return this.clientManager.sendMessage(businessId, phone, message);
  }
}


// import { Injectable, NotFoundException, Logger } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { Business } from '../../database/entities/business.entity';
// import { WhatsAppClientManager } from './service/whatsapp-client.manager';
// import { WhatsAppMessageHandler } from './service/whatsapp-message.handler';
// import { WhatsAppSession } from '../../database/entities/whatsapp-session.entity';
// import { MessageHandlerServiceAdvance } from './service/whatsapp-message.handler-advance';

// @Injectable()
// export class WhatsAppService {
//   private readonly logger = new Logger(WhatsAppService.name);

//   constructor(
//     @InjectRepository(Business)
//     private readonly businessRepo: Repository<Business>,
//     private readonly clientManager: WhatsAppClientManager,
//     private readonly messageHandler: WhatsAppMessageHandler,
//     private readonly messageHandlerService: MessageHandlerServiceAdvance,
//     @InjectRepository(WhatsAppSession)
//     private whatsappRepo: Repository<WhatsAppSession>,
//   ) { }

//   async onModuleInit() {
//     this.logger.log('🔄 Checking for previously connected WhatsApp clients...');
//     const sessions = await this.whatsappRepo.find({
//       relations: ['business'],
//       where: { session_data: 'connected' },
//     });

//     if (!sessions.length) {
//       this.logger.log('⚠️ No previously connected sessions found.');
//       return;
//     }

//     for (const session of sessions) {
//       const businessId = session.business?.id;
//       try {
//         this.logger.log(
//           `📲 Auto-connecting WhatsApp client for Business ID: ${businessId}...`,
//         );
//         // Fast return if already connected
//         console.log('Checking: ' + this.clientManager.isConnected(businessId!));
//         if (this.clientManager.isConnected(businessId!)) {
//           return { status: 'success', message: 'Client already connected', connected: true, qr: null };
//         }

//         // Otherwise, create or reconnect
//         const clientResult = await this.clientManager.createClient(businessId!);

//         // Bind message listener only once
//         const client = clientResult.client;
//         client.sendSeen = async (chatId: string): Promise<boolean> => {
//           console.log(`Seen sent to ${chatId}`);
//           return true;
//         };
//         // === Bind message listener ===
//         // eslint-disable-next-line @typescript-eslint/no-misused-promises
//         client.on('message', async (msg) => {
//           console.log(msg.body);
//           if (msg.body == '!ping') {
//             msg.reply('pong'); 
//           }
          

//           // const contact = await msg.getContact(); // ✅ await
//           // const name = contact.pushname || contact.name || 'Unknown';
//           // const text = msg.body?.trim();

//           // console.log('Message received in onModuleInit:', text);
//           // console.log('From:', msg.from);
//           // console.log('Contact Name:', name);
//           // client.sendMessage(msg.from, 'Auto-reply: Message received');
//           // await this.messageHandler.handleIncomingMessage(
//           //   client,
//           //   businessId!,
//           //   msg.from,
//           //   name,
//           //   text,
//           //   msg
//           // );  

//           // await this.messageHandler.handleIncomingMessage(client, businessId!, msg.from, name, text, msg);
//           //    await this.messageHandlerService.handleIncomingMessage(
//           //   client,
//           //   businessId!,
//           //   msg.from,
//           //   name,
//           //   text,
//           //   msg
//           // );
//         });

//         this.logger.log(
//           `✅ WhatsApp client for Business ID ${businessId} connected successfully!`,
//         );
//       } catch (err) {
//         if (err instanceof Error) {
//           this.logger.error(
//             `❌ Failed to reconnect Business ID ${businessId}: ${err.message}`,
//           );
//         } else {
//           this.logger.error(
//             `❌ Failed to reconnect Business ID ${businessId}: ${String(err)}`,
//           );
//         }
//         this.clientManager.saveSessionStatus(businessId!, 'disconnected');
//       }
//     }
//   }

//   async initClient(businessId: number, ownerId: number) {
//     const business = await this.businessRepo.findOne({
//       where: { id: businessId, owner: { id: ownerId } },
//     });
//     if (!business) throw new NotFoundException('Business not found or not owned by you');

//     console.log('Checking: ' + this.clientManager.isConnected(businessId));
//     // Fast return if already connected
//     if (this.clientManager.isConnected(businessId)) {
//       return { status: 'success', message: 'Client already connected', connected: true, qr: null };
//     }

//     // Otherwise, create or reconnect
//     const clientResult = await this.clientManager.createClient(businessId);

//     // Bind message listener only once  
//     const client = clientResult.client;
//     client.removeAllListeners('message');
//     client.on('message', (msg) => {
//       (async () => {
//         try {
//           const name = msg.getContact.name;
//           const text = msg.body?.trim();
//           await this.messageHandler.handleIncomingMessage(client, businessId, msg.from, name, text, msg);
//           //    await this.messageHandlerService.handleIncomingMessage(
//           //   client,
//           //   businessId,
//           //   msg.from,
//           //   name,
//           //   text,
//           //   msg
//           // );
//         } catch (err) {
//           this.logger.error(`Message handling error: ${err}`);
//         }
//       })();
//     });

//     return {
//       status: clientResult.status,
//       message: clientResult.message,
//       connected: clientResult.connected,
//       qr: clientResult.qr || null,
//     };
//   }


// }


// // import {
// //   Injectable,
// //   NotFoundException,
// //   OnModuleInit,
// //   Logger,
// // } from '@nestjs/common';
// // import { InjectRepository } from '@nestjs/typeorm';
// // import { Repository } from 'typeorm';
// // import { WhatsAppSession } from '../../database/entities/whatsapp-session.entity';
// // import { Business } from '../../database/entities/business.entity';
// // import { WhatsAppClientManager } from './service/whatsapp-client.manager';
// // import { WhatsAppMessageHandler } from './service/whatsapp-message.handler';

// // @Injectable()
// // export class WhatsAppService implements OnModuleInit {
// //   private readonly logger = new Logger(WhatsAppService.name);

// //   constructor(
// //     @InjectRepository(WhatsAppSession)
// //     private readonly whatsappRepo: Repository<WhatsAppSession>,
// //     @InjectRepository(Business)
// //     private readonly businessRepo: Repository<Business>,
// //     private readonly clientManager: WhatsAppClientManager,
// //     private readonly messageHandler: WhatsAppMessageHandler,
// //   ) {}

// //   /**
// //    * Auto-reconnect clients when the server restarts
// //    */
// //   async onModuleInit() {
// //     // this.logger.log('🔄 Checking for previously connected WhatsApp clients...');
// //     // const sessions = await this.whatsappRepo.find({
// //     //   relations: ['business'],
// //     //   where: { session_data: 'connected' },
// //     // });

// //     // if (!sessions.length) {
// //     //   this.logger.log('⚠️ No previously connected sessions found.');
// //     //   return;
// //     // }

// //     // for (const session of sessions) {
// //     //   const businessId = session.business.id;
// //     //   try {
// //     //     this.logger.log(
// //     //       `📲 Auto-connecting WhatsApp client for Business ID: ${businessId}...`,
// //     //     );
// //     //     const client = await this.clientManager.createClient(businessId);

// //     //     // === Bind message listener ===
// //     //     // eslint-disable-next-line @typescript-eslint/no-misused-promises
// //     //     client.on('message', async (msg) => {
// //     //       const contact = await msg.getContact();
// //     //       const name = contact.pushname || contact.name || contact.number;
// //     //       const text = msg.body?.trim();

// //     //       await this.messageHandler.handleIncomingMessage(
// //     //         client,
// //     //         businessId,
// //     //         msg.from,
// //     //         name,
// //     //         text,
// //     //         msg
// //     //       );
// //     //     });

// //     //     // eslint-disable-next-line @typescript-eslint/no-misused-promises
// //     //     client.on('disconnected', async () => {
// //     //       await this.clientManager.stopClient(businessId);
// //     //       await this.saveSessionStatus(businessId, 'disconnected');
// //     //     });

// //     //     this.logger.log(
// //     //       `✅ WhatsApp client for Business ID ${businessId} connected successfully!`,
// //     //     );
// //     //   } catch (err) {
// //     //     if (err instanceof Error) {
// //     //       this.logger.error(
// //     //         `❌ Failed to reconnect Business ID ${businessId}: ${err.message}`,
// //     //       );
// //     //     } else {
// //     //       this.logger.error(
// //     //         `❌ Failed to reconnect Business ID ${businessId}: ${String(err)}`,
// //     //       );
// //     //     }
// //     //     await this.saveSessionStatus(businessId, 'disconnected');
// //     //   }
// //     // }
// //   }

// //   /**
// //    * Manual connection by business owner
// //    */
// //   async initClient(businessId: number, ownerId: number) {
// //     const business = await this.businessRepo.findOne({
// //       where: { id: businessId, owner: { id: ownerId } },
// //     });

// //     if (!business)
// //       throw new NotFoundException('Business not found or not owned by you');

// //     const client = await this.clientManager.createClient(businessId);

// //     // eslint-disable-next-line @typescript-eslint/no-misused-promises
// //     client.on('message', async (msg) => {
// //       const contact = await msg.getContact();
// //       const name = contact.pushname || contact.name || contact.number;
// //       const text = msg.body?.trim();

// //       await this.messageHandler.handleIncomingMessage(
// //         client,
// //         businessId,
// //         msg.from,
// //         name,
// //         text,
// //         msg
// //       );
// //     });

// //     // eslint-disable-next-line @typescript-eslint/no-misused-promises
// //     client.on('disconnected', async () => {
// //       await this.clientManager.stopClient(businessId);
// //       await this.saveSessionStatus(businessId, 'disconnected');
// //     });

// //     await this.saveSessionStatus(businessId, 'connected');
// //     this.logger.log(
// //       `✅ Client manually initialized for Business ID: ${businessId}`,
// //     );
// //     return { status: 'success', message: 'Client initialized' };
// //   }

// //   /**
// //    * Save or update session connection status
// //    */
// //   async saveSessionStatus(businessId: number, status: string) {
// //     let session = await this.whatsappRepo.findOne({
// //       where: { business: { id: businessId } },
// //       relations: ['business'],
// //     });

// //     if (!session) {
// //       const business = await this.businessRepo.findOneBy({ id: businessId });
// //       if (!business) {
// //         throw new Error(`Business with ID ${businessId} not found`);
// //       }

// //       session = this.whatsappRepo.create({
// //         business,
// //         session_data: status,
// //       });
// //     } else {
// //       session.session_data = status;
// //     }

// //     await this.whatsappRepo.save(session);
// //   }
// // }
