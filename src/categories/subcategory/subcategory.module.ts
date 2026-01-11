import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubcategoryService } from './subcategory.service';
import { SubcategoryController } from './subcategory.controller';
import { ProductSubCategory } from '../../database/entities/product-subcategory.entity';
import { ProductCategory } from '../../database/entities/product-category.entity';
import { User } from '../../database/entities/user.entity';
import { Business } from '../../database/entities/business.entity';
import { Manager } from '../../database/entities/managers.entity';
import { Staff } from '../../database/entities/staff.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductSubCategory, ProductCategory, User, Business, Manager, Staff]), // register entities
  ],
  controllers: [SubcategoryController],
  providers: [SubcategoryService],
  exports: [SubcategoryService], // optional: if other modules need this service
})
export class SubcategoryModule {}
