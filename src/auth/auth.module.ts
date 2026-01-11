// auth/auth.module.ts
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from '../database/entities/business.entity';
import { WhatsAppSession } from '../database/entities/whatsapp-session.entity';
import { BotMessage } from '../database/entities/bot-messages.entity';
import { BotMessageGateway } from '../gateway/bot-message.gateway';
import { Permission } from '../database/entities/permission.entity';
import { RolePermission } from '../database/entities/role-permission.entity';
import { Role } from '../database/entities/role.entity';
import { Manager } from '../database/entities/managers.entity';
import { Staff } from '../database/entities/staff.entity';
import { BusinessPaymentOption } from '../database/entities/business-payment-options.entity';

@Module({
  imports: [
    UsersModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
    TypeOrmModule.forFeature([Business, WhatsAppSession, BotMessage, Role, Permission, RolePermission, Manager, Staff, BusinessPaymentOption]), 
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, BotMessageGateway],
})
export class AuthModule {}
