import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { BusinessDeliveryFee } from '../database/entities/business-delivery-fee.entity';
import { BusinessPaymentOption } from '../database/entities/business-payment-options.entity';
import { Business } from '../database/entities/business.entity';
import { User } from '../database/entities/user.entity';
import { Manager } from '../database/entities/managers.entity';
import { Staff } from '../database/entities/staff.entity';

// Services & Controllers
import { DeliveryFeeService } from './delivery-fee/delivery-fee.service';
import { DeliveryFeeController } from './delivery-fee/delivery-fee.controller';

import { PaymentOptionService } from './payment-option/payment-option.service';
import { PaymentOptionController } from './payment-option/payment-option.controller';

// Activity Log Module
import { TeamActivityModule } from '../team-activity/team-activity.module';
import { BusinessController } from './business/business.controller';
import { BusinessService } from './business/business.service';
import { BotMessage } from '../database/entities/bot-messages.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusinessDeliveryFee,
      BusinessPaymentOption,
      Business,
      User,
      Manager,
      Staff,
      BotMessage
    ]),
    TeamActivityModule,
  ],
  controllers: [
    DeliveryFeeController,
    PaymentOptionController,
    BusinessController
  ],
  providers: [
    DeliveryFeeService,
    PaymentOptionService,
    BusinessService
  ],
})
export class SettingModule {}
