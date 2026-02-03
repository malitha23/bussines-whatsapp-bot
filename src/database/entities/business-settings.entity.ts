// business-settings.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { Business } from './business.entity';

@Entity('business_settings')
export class BusinessSettings {
  @PrimaryGeneratedColumn()
  id!: number;

  @OneToOne(() => Business, business => business.settings)
  @JoinColumn()
  business!: Business;

  @Column({ default: true })
  auto_reply_enabled!: boolean;

  @Column({ nullable: true })
  greeting_message!: string;

  @Column({ nullable: true })
  order_confirmation_message!: string;

  @Column({ nullable: true })
  help_message!: string;

  @Column({ nullable: true })
  default_reply_message!: string;

  @Column({ default: '09:00' })
  business_hours_start!: string;

  @Column({ default: '17:00' })
  business_hours_end!: string;

  @Column({ default: false })
  out_of_hours_auto_reply!: boolean;

  @Column({ nullable: true })
  out_of_hours_message!: string;

  @Column({ nullable: true })
  ai_prompt_template!: string;

  @Column({ default: false })
  ai_order_extraction_enabled!: boolean;

  @Column({ type: 'json', nullable: true })
  quick_replies!: string[]; // ["Menu", "Order Status", "Help", "Contact Support"]
}