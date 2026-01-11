import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Business } from './business.entity';

@Entity('team_activity')
export class TeamActivity {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { nullable: false })
  user!: User; // User who performed the action

  @ManyToOne(() => Business, { nullable: false })
  business!: Business; // Business related to the action

  @Column()
  action!: string; // Description of the activity

  @CreateDateColumn()
  created_at!: Date; // Timestamp
}
