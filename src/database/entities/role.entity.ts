import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { RolePermission } from './role-permission.entity';


@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string; // e.g. super_admin, owner, manager, staff

  @Column({ nullable: true })
  description?: string;

  @Column({ default: 1 })
  status!: number; // 1 active

  @OneToMany(() => RolePermission, (rp) => rp.role)
  permissions!: RolePermission[];

  @CreateDateColumn()
  created_at!: Date;
}
