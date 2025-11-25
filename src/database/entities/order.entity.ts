import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Business } from './business.entity';
import { Customer } from './customer.entity';
import { OrderItem } from './order-item.entity';

// ✅ Updated PaymentStatus type to include 'refund'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refund';
export type DeliveryStatus = 'pending' | 'shipped' | 'delivered' | 'canceled';
export type PaymentMethod = 'card' | 'deposit' | 'cod'; // Added COD
export type OrderStatus = 'pending' | 'confirmed' | 'paid' | 'shipped' | 'delivered' | 'canceled' | 'refunded';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Business, (business) => business.orders, { onDelete: 'CASCADE' })
  business!: Business;

  @ManyToOne(() => Customer, (customer) => customer.orders, { onDelete: 'SET NULL' })
  customer!: Customer;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items!: OrderItem[];

  @Column('decimal', { precision: 10, scale: 2 })
  total_amount!: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  delivery_fee!: number;

  @Column({
    type: 'enum',
    enum: ['card', 'deposit', 'cod'], // Added COD
    default: 'card',
  })
  payment_method!: PaymentMethod;

  @Column({ type: 'text', nullable: true })
  payment_receipt_url?: string;

  // ✅ Updated enum for PaymentStatus
  @Column({
    type: 'enum',
    enum: ['pending', 'paid', 'failed', 'refund'],
    default: 'pending',
  })
  payment_status!: PaymentStatus;

  @Column({
    type: 'enum',
    enum: ['pending', 'shipped', 'delivered', 'canceled'],
    default: 'pending',
  })
  delivery_status!: DeliveryStatus;

  @Column({
    type: 'enum',
    enum: ['pending', 'confirmed', 'paid', 'shipped', 'delivered', 'canceled', 'refunded'],
    default: 'pending',
  })
  status!: OrderStatus;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;
}
