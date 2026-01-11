import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Business } from './business.entity';

@Entity('whatsapp_sessions')
export class WhatsAppSession {
  @PrimaryGeneratedColumn()
  id!: number; // ✅ definite assignment


  @ManyToOne(() => Business, (business) => business.whatsappSessions, {
    nullable: true, // allow NULL
    onDelete: 'SET NULL', // optional: automatically set NULL if business deleted
  })
  business?: Business;


  @Column('text')
  session_data!: string;

  @Column({ default: true })
  is_active!: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;
}
