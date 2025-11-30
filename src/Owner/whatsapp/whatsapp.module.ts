// src/owner/whatsapp/whatsapp.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppSession } from '../../database/entities/whatsapp-session.entity';
import { Business } from '../../database/entities/business.entity';
import { OwnerModule } from '../owner.module';
import { UserState } from '../../database/entities/user_states.entity';
import { WhatsAppClientManager } from './service/whatsapp-client.manager';
import { WhatsAppMessageHandler } from './service/whatsapp-message.handler';
import { BotMessage } from '../../database/entities/bot-messages.entity';
import { MessagesService } from './service/MessagesService/MessagesService';
import { Product } from '../../database/entities/product.entity';
import { Customer } from '../../database/entities/customer.entity';
import { ProductVariant } from '../../database/entities/product-variant.entity';
import { Order } from '../../database/entities/order.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import { OrderCancellation } from '../../database/entities/order-cancellation.entity';
import { BusinessPaymentOption } from '../../database/entities/business-payment-options.entity';
import { BusinessDeliveryFee } from '../../database/entities/business-delivery-fee.entity';
import { WhatsAppGateway } from './whatsapp.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsAppSession, Business, UserState, BotMessage, Product, Customer, ProductVariant, Order, OrderItem, OrderCancellation, BusinessPaymentOption, BusinessDeliveryFee]),
    OwnerModule,
  ],
  providers: [WhatsAppService, WhatsAppClientManager, WhatsAppMessageHandler,MessagesService, WhatsAppGateway, WhatsAppClientManager],
  controllers: [WhatsAppController],
  exports: [WhatsAppClientManager],
})
export class WhatsAppModule {}
