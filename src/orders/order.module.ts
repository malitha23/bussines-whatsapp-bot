import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { Order } from '../database/entities/order.entity';
import { Customer } from '../database/entities/customer.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { ProductVariant } from '../database/entities/product-variant.entity';
import { Business } from '../database/entities/business.entity';
import { OrderCancellation } from '../database/entities/order-cancellation.entity';
import { User } from '../database/entities/user.entity';
import { Manager } from '../database/entities/managers.entity';
import { Staff } from '../database/entities/staff.entity';
import { TeamActivityModule } from '../team-activity/team-activity.module';
import { OrderTracking } from '../database/entities/order-tracking.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      Customer,
      OrderItem,
      ProductVariant,
      Business,
      OrderCancellation,
      User,
      Manager,
      Staff,
      OrderTracking
    ]),
    TeamActivityModule
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService]
})
export class OrderModule {}