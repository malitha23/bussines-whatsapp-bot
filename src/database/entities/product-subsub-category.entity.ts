import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { ProductSubCategory } from './product-subcategory.entity';
import { Product } from './product.entity'; // ⚠️ make sure you import this

@Entity('product_subsub_categories')
export class ProductSubSubCategory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @ManyToOne(
    () => ProductSubCategory,
    (subcategory) => subcategory.subsubcategories,
  )
  subcategory!: ProductSubCategory;

  // ✅ Correct way to define products relation
  @OneToMany(() => Product, (product) => product.subsubCategory)
  products!: Product[];
}
