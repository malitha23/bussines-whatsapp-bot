import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('user_states')
@Unique(['phone', 'business_id'])
export class UserState {
  @PrimaryGeneratedColumn()
  id!: number;

  // Store full WhatsApp phone like 94774748525@c.us
  @Column({ type: 'varchar', length: 50 })
  phone!: string;

  // Optional display name (from WhatsApp contact)
  @Column({ type: 'varchar', length: 100, nullable: true })
  name!: string;

  @Column()
  business_id!: number;

  @Column({ nullable: true })
  state!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  previous_state!: string; 

  @Column({ type: 'text', nullable: true })
  last_message!: string;

  @Column({ type: 'varchar', length: 5, nullable: true })
  language!: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at!: Date;
}
