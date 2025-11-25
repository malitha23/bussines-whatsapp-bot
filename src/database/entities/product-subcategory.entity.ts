import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { ProductCategory } from './product-category.entity';
import { ProductSubSubCategory } from './product-subsub-category.entity';
import { Product } from './product.entity';

@Entity('product_subcategories')
export class ProductSubCategory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @ManyToOne(() => ProductCategory, (category) => category.subcategories)
  category!: ProductCategory;

  @OneToMany(() => ProductSubSubCategory, (subsub) => subsub.subcategory)
  subsubcategories!: ProductSubSubCategory[];

  @OneToMany(() => Product, (product) => product.subCategory)
  products!: Product[];

}
