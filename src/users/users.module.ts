// users/users.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { UsersService } from './user.service';
import { Business } from '../database/entities/business.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Business])],
  providers: [UsersService],
  exports: [UsersService], // important to use it in AuthModule
})
export class UsersModule {}
