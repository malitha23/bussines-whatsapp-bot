// teamManage.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { Manager } from '../database/entities/managers.entity';
import { Staff } from '../database/entities/staff.entity';
import { RolePermission } from '../database/entities/role-permission.entity';
import { TeamManageService } from './teamManage.service';
import { TeamManageController } from './teamManage.controller';
import { Business } from '../database/entities/business.entity';
import { Permission } from '../database/entities/permission.entity';
import { Role } from '../database/entities/role.entity';
import { TeamActivityModule } from '../team-activity/team-activity.module';
import { OrderModule } from '../orders/order.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Manager, Staff, RolePermission, Business, Permission, Role]), TeamActivityModule, OrderModule],
  providers: [TeamManageService],
  controllers: [TeamManageController],
})
export class TeamManageModule {}
