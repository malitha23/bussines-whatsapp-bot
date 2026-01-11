import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { TeamManageService } from './teamManage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard, Roles } from '../guards/role.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { BulkStatusDto, BulkDeleteDto } from './dto/bulk-action.dto';
import { FilterUsersDto } from './dto/filter-users.dto';

@Controller('business/team-manage')
@UseGuards(JwtAuthGuard, RoleGuard)
export class TeamManageController {
  constructor(private readonly teamManageService: TeamManageService) { }

  // -------------------------------------------------------
  // GET endpoints
  // -------------------------------------------------------

  @Get('team')
  @Roles('owner', 'manager')
  async getTeam(@Req() req: Request & { user: JwtPayload }) {
    const users = await this.teamManageService.getTeamData(req.user.email);
    return { status: 'success', data: users };
  }

  @Get('users/:id')
  @Roles('owner', 'manager')
  async getUserById(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const user = await this.teamManageService.getUserById(req.user.email, id);
    return { status: 'success', data: user };
  }

  // @Get('users')
  // @Roles('owner', 'manager')
  // async filterUsers(
  //   @Req() req: Request & { user: JwtPayload },
  //   @Query() filterDto: FilterUsersDto,
  // ) {
  //   const result = await this.teamManageService.filterUsers(req.user.email, filterDto);
  //   return { status: 'success', ...result };
  // }

  @Get('permissions')
  @Roles('owner', 'manager')
  async getAvailablePermissions() {
    const permissions = await this.teamManageService.getAvailablePermissions();
    return { status: 'success', data: permissions };
  }

  @Get('role-permissions')
  @Roles('owner')
  async getRoleDefinitions(
    @Req() req: Request & { user: JwtPayload },
  ) {
    const rolepermissions = await this.teamManageService.getRoleDefinitions(req.user.email);
    return { status: 'success', data: rolepermissions };
  }

  @Roles('owner')
  @Patch('role-permission')
  async updateRolePermission(
     @Req() req: Request & { user: JwtPayload },
    @Body('role') role: string,
    @Body('permission') permission: string,
    @Body('status') status: number | null,
  ) {
    const result = await this.teamManageService.updateRolePermission(role, permission, status, req.user.email);
    return { status: 'success', data: result };
  }


  @Get('export')
  @Roles('owner', 'manager')
  async exportUsers(
    @Req() req: Request & { user: JwtPayload },
    @Res() res: Response,
  ) {
    const csv = await this.teamManageService.exportUsers(req.user.email);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="team-users-${new Date().toISOString().split('T')[0]}.csv"`,
    );

    return res.send(csv);
  }

  // // -------------------------------------------------------
  // // POST endpoints
  // // -------------------------------------------------------

  @Post('users')
  @Roles('owner', 'manager')
  async createUser(
    @Req() req: Request & { user: JwtPayload },
    @Body() createUserDto: CreateUserDto,
  ) {
    const user = await this.teamManageService.createUser(req.user.email, createUserDto);
    return { status: 'success', data: user, message: 'User created successfully' };
  }

  // // -------------------------------------------------------
  // // PUT endpoints
  // // -------------------------------------------------------

  @Put('users/:id')
  @Roles('owner', 'manager')
  async updateUser(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const user = await this.teamManageService.updateUser(req.user.email, id, updateUserDto);
    return { status: 'success', data: user, message: 'User updated successfully' };
  }

  // @Put('users/:id/permissions')
  // @Roles('owner', 'manager')
  // async updateUserPermissions(
  //   @Req() req: Request & { user: JwtPayload },
  //   @Param('id', ParseIntPipe) id: number,
  //   @Body() updatePermissionsDto: UpdatePermissionsDto,
  // ) {
  //   const user = await this.teamManageService.updateUserPermissions(
  //     req.user.email,
  //     { ...updatePermissionsDto, userId: id },
  //   );
  //   return { status: 'success', data: user, message: 'Permissions updated successfully' };
  // }

  // // -------------------------------------------------------
  // // PATCH endpoints
  // // -------------------------------------------------------

  // @Patch('users/:id/status')
  // @Roles('owner', 'manager')
  // async updateUserStatus(
  //   @Req() req: Request & { user: JwtPayload },
  //   @Param('id', ParseIntPipe) id: number,
  //   @Body('status') status: string,
  // ) {
  //   await this.teamManageService.updateUserStatus(req.user.email, id, status as any);
  //   return { status: 'success', message: 'User status updated successfully' };
  // }

  @Patch('users/bulk/status')
  @Roles('owner', 'manager')
  async bulkUpdateStatus(
    @Req() req: Request & { user: JwtPayload },
    @Body() bulkStatusDto: BulkStatusDto,
  ) {
    const result = await this.teamManageService.bulkUpdateStatus(req.user.email, bulkStatusDto);
    return { status: 'success', message: result.message };
  }

  // // -------------------------------------------------------
  // // DELETE endpoints
  // // -------------------------------------------------------

  @Delete('users/:id')
  @Roles('owner', 'manager')
  async deleteUser(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.teamManageService.deleteUser(req.user.email, id);
    return { status: 'success', message: result.message };
  }

  @Patch('users/bulk/delete')
  @Roles('owner', 'manager')
  async bulkDeleteUsers(
    @Req() req: Request & { user: JwtPayload },
    @Body() bulkDeleteDto: BulkDeleteDto,
  ) {
    const result = await this.teamManageService.bulkDeleteUsers(req.user.email, bulkDeleteDto);
    return { status: 'success', message: result.message };
  }


}