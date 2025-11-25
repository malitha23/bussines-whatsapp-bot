import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Business } from './business.entity'; // adjust path if needed

@Entity('business_payment_options')
export class BusinessPaymentOption {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Business, (business) => business.paymentOptions, { onDelete: 'CASCADE' })
  business!: Business;

  @Column({ type: 'varchar', length: 50 })
  option_name!: string; // Display name for the customer (e.g., "Card Payment")

  @Column({ type: 'varchar', length: 50 })
  key_name!: string; // Internal identifier (e.g., "card", "deposit", "cod")

  @Column({ type: 'tinyint', default: 1 })
  enabled!: number; // 1 = enabled, 0 = disabled

  @CreateDateColumn({ type: 'timestamp' })
  created_at!: Date;
}
