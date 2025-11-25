import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Customer } from './customer.entity';
import { Business } from './business.entity';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Business)
  business!: Business;

  @ManyToOne(() => Customer)
  customer!: Customer;

  @Column('text')
  message_text!: string;

  @Column({ default: 'sent' })
  status!: string; // sent | delivered | read

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;
}
