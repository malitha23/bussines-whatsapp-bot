import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order } from '../../database/entities/order.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ProductVariant } from '../../database/entities/product-variant.entity';
import { InventoryStock } from '../../database/entities/inventory-stock.entity';
import { InventoryTransaction } from '../../database/entities/inventory-transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, ProductVariant, InventoryStock, InventoryTransaction ]), WhatsAppModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
