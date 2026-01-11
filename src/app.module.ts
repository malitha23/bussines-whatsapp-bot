import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { OwnerModule } from './Owner/owner.module';
import { WhatsAppModule } from './Owner/whatsapp/whatsapp.module';
import { InventoryModule } from './inventory/inventory.module';
import { OrdersModule } from './Owner/orders/orders.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CategoryModule } from './categories/category/category.module';
import { SubcategoryModule } from './categories/subcategory/subcategory.module';
import { SubSubCategoryModule } from './categories/subsubcategory/subsubcategory.module';
import { TeamManageModule } from './teamManage/teamManage.module';
import { SettingModule } from './setting/setting.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ConfigModule.forRoot({ isGlobal: true }),
    OwnerModule,
    WhatsAppModule,
    InventoryModule,
    OrdersModule,
    DashboardModule,
    CategoryModule,
    SubcategoryModule,
    SubSubCategoryModule,
    TeamManageModule,
    SettingModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
