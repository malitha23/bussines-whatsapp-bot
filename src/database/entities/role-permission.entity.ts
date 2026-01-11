import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from './role.entity';
import { Permission } from './permission.entity';
import { Business } from './business.entity';

@Entity('role_permissions')
export class RolePermission {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Role, (role) => role.permissions, { eager: true, onDelete: 'CASCADE' })
  role!: Role;

  @ManyToOne(() => Permission, (permission) => permission.rolePermissions, { eager: true, onDelete: 'CASCADE' })
  permission!: Permission;


  @ManyToOne(() => Business, (business) => business.rolePermissions, {
    nullable: true,
    onDelete: 'CASCADE', // matches migration
  })
  business?: Business;


  @Column({ type: 'tinyint', default: 1 })
  status!: number; // 1 active, 0 inactive

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
