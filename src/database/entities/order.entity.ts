import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, BeforeInsert } from 'typeorm';
import { Business } from './business.entity';
import { Customer } from './customer.entity';
import { OrderItem } from './order-item.entity';
import { OrderTracking } from './order-tracking.entity';

// ✅ Updated PaymentStatus type to include 'refund'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refund' | 'partially_refunded';
export type DeliveryStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'returned'
  | 'canceled';

export type PaymentMethod = 'card' | 'deposit' | 'cod'; // Added COD
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'return_requested'
  | 'returned'
  | 'canceled'
  | 'refunded'
  | 'partially_refunded';


@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 20, unique: true })
  order_number!: string;

  @ManyToOne(() => Business, (business) => business.orders, { onDelete: 'CASCADE' })
  business!: Business;

  @ManyToOne(() => Customer, (customer) => customer.orders, { onDelete: 'SET NULL' })
  customer!: Customer;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items!: OrderItem[];

  @OneToMany(() => OrderTracking, (tracking) => tracking.order)
  tracking!: OrderTracking[];


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
    enum: ['pending', 'paid', 'failed', 'refund', 'partially_refunded'],
    default: 'pending',
  })
  payment_status!: PaymentStatus;

  @Column({
    type: 'enum',
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'return_requested', 'returned', 'canceled'],
    default: 'pending',
  })
  delivery_status!: DeliveryStatus;

  @Column({
    type: 'enum',
    enum: ['pending', 'confirmed', 'paid', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'return_requested', 'returned', 'canceled', 'refunded', 'partially_refunded'],
    default: 'pending',
  })
  status!: OrderStatus;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @BeforeInsert()
  generateOrderNumber() {
    // Example format: ORD-20251220-0001
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
    this.order_number = `ORD-${datePart}-${randomPart}`;
  }
}
