import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('bot_messages')
export class BotMessage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  business_id!: number;

  @Column({ length: 5 })
  language!: string;

  @Column({ length: 100 })
  key_name!: string;

  @Column('text')
  text!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
