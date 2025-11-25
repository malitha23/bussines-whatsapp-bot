import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ProductVariant } from './product-variant.entity';

@Entity('inventory_stock')
export class InventoryStock {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => ProductVariant)
  variant!: ProductVariant;

  @Column('decimal', { precision: 10, scale: 2 }) // <- decimal column
  quantity!: number;

  @Column({ default: 'warehouse' })
  location!: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updated_at!: Date;
}
