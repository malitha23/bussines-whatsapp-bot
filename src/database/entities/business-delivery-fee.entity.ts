 import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Business } from './business.entity';

@Entity('business_delivery_fee')
export class BusinessDeliveryFee {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Business, (business) => business.deliveryFees, { onDelete: 'CASCADE' })
  business!: Business;

  @Column({ type: 'enum', enum: ['weight', 'volume', 'count'] })
  unit_type!: 'weight' | 'volume' | 'count';

  @Column('decimal', { precision: 10, scale: 2 })
  min_value!: number;

  @Column('decimal', { precision: 10, scale: 2 })
  max_value!: number;

  @Column('decimal', { precision: 10, scale: 2 })
  fee!: number;
}
