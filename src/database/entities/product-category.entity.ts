import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Business } from './business.entity';
import { ProductSubCategory } from './product-subcategory.entity';
import { Product } from 'whatsapp-web.js';

@Entity('product_categories')
export class ProductCategory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @ManyToOne(() => Business, (business) => business.categories)
  business!: Business;

  @OneToMany(() => ProductSubCategory, (sub) => sub.category)
  subcategories!: ProductSubCategory[];
products!: Product[];
}
