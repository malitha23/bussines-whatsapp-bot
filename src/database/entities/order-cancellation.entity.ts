// database/entities/order-cancellation.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Order } from './order.entity';

@Entity('order_cancellations')
export class OrderCancellation {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Order)
  order!: Order;

  @Column({ type: 'text', nullable: true })
  reason!: string;

  @Column({ type: 'enum', enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status!: 'pending' | 'approved' | 'rejected';

  @CreateDateColumn()
  created_at!: Date;
}
