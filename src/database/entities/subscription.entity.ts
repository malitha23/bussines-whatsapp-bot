import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { SubscriptionPlan } from './subscription-plan.entity';
import { Business } from './business.entity';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn()
  id!: number; // ✅ definite assignment

  @ManyToOne(() => Business, (business) => business.subscriptions)
  business!: Business;

  @ManyToOne(() => SubscriptionPlan, (plan) => plan.subscriptions)
  plan!: SubscriptionPlan;

  @Column({ type: 'date' })
  start_date!: Date;

  @Column({ type: 'date' })
  end_date!: Date;

  @Column({ default: true })
  is_active!: boolean;
}
