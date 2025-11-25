import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../../database/entities/product.entity';
import { ProductVariant } from '../../database/entities/product-variant.entity';
import { InventoryStock } from '../../database/entities/inventory-stock.entity';
import { InventoryTransaction } from '../../database/entities/inventory-transaction.entity';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { Business } from '../../database/entities/business.entity';
import { ProductSubSubCategory } from '../../database/entities/product-subsub-category.entity';
import { VariantImage } from '../../database/entities/variant-image.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductVariant,
      VariantImage,
      InventoryStock,
      InventoryTransaction,
      Business, 
      ProductSubSubCategory,
    ]),
  ],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
