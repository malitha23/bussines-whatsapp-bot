import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Business } from './business.entity';
import { Manager } from './managers.entity';
import { Staff } from './staff.entity';

export enum UserRole {
  ADMIN = 'super_admin',
  BUSINESS_OWNER = 'owner',
  MANAGER = 'manager',
  STAFF = 'staff',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number; 

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

  @OneToMany(() => Manager, (manager) => manager.user)
  managedBusinesses!: Manager[];

  // If user is a staff assigned to businesses
  @OneToMany(() => Staff, (staff) => staff.user)
  staffAssignments!: Staff[];
}
