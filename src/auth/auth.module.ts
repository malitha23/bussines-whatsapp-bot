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
    TypeOrmModule.forFeature([Business, WhatsAppSession, BotMessage]), 
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, BotMessageGateway],
})
export class AuthModule {}
