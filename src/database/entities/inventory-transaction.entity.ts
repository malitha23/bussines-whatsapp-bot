import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Product } from './product.entity';
import { ProductVariant } from './product-variant.entity';

@Entity('inventory_transactions')
export class InventoryTransaction {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Product)
  product!: Product;

  @ManyToOne(() => ProductVariant, { nullable: true })
  variant?: ProductVariant;

  @Column('decimal', { precision: 10, scale: 2 })
  quantity!: number;

  @Column({
    type: 'enum',
    enum: ['IN', 'OUT'],
  })
  type!: 'IN' | 'OUT';

  @Column({ nullable: true })
  note?: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;
}
