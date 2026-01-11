import { Module } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCategory } from '../../database/entities/product-category.entity';
import { Manager } from '../../database/entities/managers.entity';
import { Staff } from '../../database/entities/staff.entity';
import { Business } from '../../database/entities/business.entity';
import { User } from '../../database/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProductCategory, Business, Manager, Staff, User])],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService], // export so subcategory can use it
})
export class CategoryModule { }
