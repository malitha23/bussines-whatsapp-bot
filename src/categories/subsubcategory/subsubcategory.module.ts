import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubSubCategoryService } from './subsubcategory.service';
import { SubSubCategoryController } from './subsubcategory.controller';
import { ProductSubSubCategory } from '../../database/entities/product-subsub-category.entity';
import { ProductSubCategory } from '../../database/entities/product-subcategory.entity';
import { Business } from '../../database/entities/business.entity';
import { User } from '../../database/entities/user.entity';
import { Staff } from '../../database/entities/staff.entity';
import { Manager } from '../../database/entities/managers.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductSubSubCategory, ProductSubCategory, Business, User, Staff, Manager]), // register entities
  ],
  controllers: [SubSubCategoryController],
  providers: [SubSubCategoryService],
  exports: [SubSubCategoryService], // optional if other modules need this service
})
export class SubSubCategoryModule {}
