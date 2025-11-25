import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Business } from './business.entity';

@Entity('business_logs')
export class BusinessLog {
  @PrimaryGeneratedColumn()
  id!: number; // TypeORM will assign this

  @ManyToOne(() => Business)
  business!: Business; // definite assignment assertion

  @Column()
  action!: string;

  @Column({ type: 'text', nullable: true })
  description?: string; // optional because nullable

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;
}
