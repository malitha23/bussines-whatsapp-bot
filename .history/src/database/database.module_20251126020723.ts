import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Business } from './entities/business.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { Subscription } from './entities/subscription.entity';
import { BusinessLog } from './entities/business-log.entity';
import { WhatsAppSession } from './entities/whatsapp-session.entity';
import { Customer } from './entities/customer.entity';
import { Message } from './entities/message.entity';
import { ProductCategory } from './entities/product-category.entity';
import { ProductSubCategory } from './entities/product-subcategory.entity';
import { ProductSubSubCategory } from './entities/product-subsub-category.entity';
import { Product } from './entities/product.entity';
import { Order } from './entities/order.entity';
import { UserState } from './entities/user_states.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { InventoryStock } from './entities/inventory-stock.entity';
import { InventoryTransaction } from './entities/inventory-transaction.entity';
import { VariantImage } from './entities/variant-image.entity';
import { BotMessage } from './entities/bot-messages.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderCancellation } from './entities/order-cancellation.entity';
import { BusinessPaymentOption } from './entities/business-payment-options.entity';
import { BusinessDeliveryFee } from './entities/business-delivery-fee.entity';
import { ConfigModule } from '@nestjs/config';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'whatsapp_business',
      entities: [
        User,
        Business,
        SubscriptionPlan,
        Subscription,
        BusinessLog,
        WhatsAppSession,
        Customer,
        Message,
        ProductCategory,
        ProductSubCategory,
        ProductSubSubCategory,
        Product,
        ProductVariant,
        VariantImage,
        InventoryStock,
        InventoryTransaction,
        Order,
        OrderItem,
        UserState,
        BotMessage,
        OrderCancellation,
        BusinessPaymentOption,
        BusinessDeliveryFee
      ],
      synchronize: false, // false in production
      logging: true,
    }),
  ],
})
export class DatabaseModule {}
