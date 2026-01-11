// src/dashboard/dashboard.module.ts
import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { QuickStatsGateway } from '../gateway/quick-stats.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { Order } from '../database/entities/order.entity';
import { OrderCancellation } from '../database/entities/order-cancellation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Order, OrderCancellation])],
  providers: [DashboardService, QuickStatsGateway],
  exports: [DashboardService, QuickStatsGateway],
})
export class DashboardModule {}
