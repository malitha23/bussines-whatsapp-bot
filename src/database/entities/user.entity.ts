import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Business } from './business.entity';

export enum UserRole {
  ADMIN = 'admin',
  BUSINESS_OWNER = 'business_owner',
  CUSTOMER = 'customer',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number; // ✅ added definite assignment

  @Column()
  name!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  password?: string;

  @Column({ nullable: true })
  phone!: string;

  @Column({
    type: 'enum',
    enum: ['super_admin', 'owner', 'manager', 'staff'],
    default: 'staff',
  })
  role_type!: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at!: Date;

  @OneToMany(() => Business, (business) => business.owner)
  businesses!: Business[];
}
