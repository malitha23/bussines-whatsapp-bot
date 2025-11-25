import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { ProductSubSubCategory } from './product-subsub-category.entity';
import { Business } from './business.entity';
import { ProductVariant } from './product-variant.entity';
import { InventoryTransaction } from './inventory-transaction.entity';
import { ProductSubCategory } from './product-subcategory.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Business)
  business!: Business;

  @ManyToOne(() => ProductSubCategory, (sub) => sub.products, { nullable: true })
subCategory!: ProductSubCategory | null;


  @ManyToOne(() => ProductSubSubCategory, (subsub) => subsub.products, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  subsubCategory!: ProductSubSubCategory | null;


  @Column()
  name!: string;

  @Column('decimal', { precision: 10, scale: 2 })
  base_price!: number;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: true })
  is_active!: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants!: ProductVariant[];

  @OneToMany(() => InventoryTransaction, (tx) => tx.product)
  inventoryTransactions!: InventoryTransaction[];
}
