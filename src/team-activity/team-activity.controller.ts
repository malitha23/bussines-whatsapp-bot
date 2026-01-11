import { Controller, Get, Req, Query, UseGuards } from '@nestjs/common';
import { TeamActivityService } from './team-activity.service';
import { Request } from 'express';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RoleGuard, Roles } from '../guards/role.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';


@Controller('team-activity')
@UseGuards(JwtAuthGuard, RoleGuard)
export class TeamActivityController {
  constructor(private readonly activityService: TeamActivityService) { }

  @Get()
  @Roles('owner', 'manager')
  async getRecentActivities(
    @Req() req: Request & { user: JwtPayload },
    @Query('limit') limit = 10,
    @Query('page') page = 1,
  ) {
    const [activities, total] = await this.activityService.getRecentActivityWithCount(
    req.user.email,
    Number(limit),
    Number(page)
  );

    return { status: 'success', data: activities, total };
  }
}
