import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { OwnerModule } from './Owner/owner.module';
import { WhatsAppModule } from './Owner/whatsapp/whatsapp.module';
import { InventoryModule } from './Owner/inventory/inventory.module';
import { OrdersModule } from './Owner/orders/orders.module';
import { WhatsAppGateway } from './Owner/whatsapp/whatsapp.gateway';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ConfigModule.forRoot({ isGlobal: true }),
    OwnerModule,
    WhatsAppModule,
    InventoryModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [AppService, WhatsAppGateway],
})
export class AppModule {}
