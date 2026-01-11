import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('order_tracking')
export class OrderTracking {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Order, (order) => order.tracking, {
    onDelete: 'CASCADE',
  })
  order!: Order;

  @Column()
  tracking_number!: string;

  @Column()
  carrier!: string;

  @Column({ type: 'date', nullable: true })
  estimated_delivery!: string | null;

  @Column({ type: 'text', nullable: true })
  additional_note?: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
