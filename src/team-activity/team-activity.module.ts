import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamActivity } from '../database/entities/team-activity.entity';
import { TeamActivityService } from './team-activity.service';
import { TeamActivityController } from './team-activity.controller';
import { User } from '../database/entities/user.entity';
import { Manager } from '../database/entities/managers.entity';
import { Staff } from '../database/entities/staff.entity';
import { Business } from '../database/entities/business.entity';

@Global() 
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TeamActivity,
      User,
      Manager,
      Staff,
      Business,
    ]),
  ],
  providers: [TeamActivityService],
  controllers: [TeamActivityController],
  exports: [TeamActivityService],
})
export class TeamActivityModule {}
