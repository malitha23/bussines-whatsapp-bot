import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Order } from './order.entity';
import { ProductVariant } from './product-variant.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  order!: Order;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  variant!: ProductVariant;

  @Column('decimal', { precision: 10, scale: 2 })
  quantity!: number;


  @Column('decimal', { precision: 10, scale: 2 })
  price_per_unit!: number;

  @Column('decimal', { precision: 10, scale: 2 })
  total_price!: number;
}
