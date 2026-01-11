import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// 🧩 Entities
import { Business } from '../database/entities/business.entity';
import { Customer } from '../database/entities/customer.entity';
import { Product } from '../database/entities/product.entity';
import { ProductVariant } from '../database/entities/product-variant.entity';
import { InventoryStock } from '../database/entities/inventory-stock.entity';
import { InventoryTransaction } from '../database/entities/inventory-transaction.entity';
import { Subscription } from '../database/entities/subscription.entity';
import { Order } from '../database/entities/order.entity';

// 🧠 Services
import { BusinessService } from './business/business.service';
import { InventoryService } from '../inventory/inventory.service';

// 🎮 Controllers
import { BusinessController } from './business/business.controller';
import { InventoryController } from '../inventory/inventory.controller';

// 🔐 Dependencies
import { UsersModule } from '../users/users.module';
import { ProductSubSubCategory } from '../database/entities/product-subsub-category.entity';
import { VariantImage } from '../database/entities/variant-image.entity';
import { Manager } from '../database/entities/managers.entity';
import { Staff } from '../database/entities/staff.entity';
import { User } from '../database/entities/user.entity';
import { ProductSubCategory } from '../database/entities/product-subcategory.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Business,
      Customer,
      Product,
      ProductVariant,
      VariantImage,
      InventoryStock,
      InventoryTransaction,
      Subscription,
      Order,
      Business,
      ProductSubSubCategory,
      User,
            Manager,
            Staff,
            ProductSubCategory
    ]),
    UsersModule,
  ],
  providers: [
    BusinessService,
    InventoryService, 
  ],
  controllers: [
    BusinessController,
    InventoryController, 
  ],
  exports: [
    BusinessService,
    InventoryService, 
  ],
})
export class OwnerModule {}
