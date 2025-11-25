import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { BusinessService } from './business.service';
import { CreateBusinessDto } from '../dto/business/create-business.dto';
import { UpdateBusinessDto } from '../dto/business/update-business.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OwnerRoleGuard } from '../guards/owner-role.guard';
import { Request } from 'express';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Controller('owner/business')
@UseGuards(JwtAuthGuard, OwnerRoleGuard)
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Post()
  create(
    @Body() dto: CreateBusinessDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return this.businessService.create(dto, req.user as any);
  }

  @Get()
  findAll(@Req() req: Request & { user: JwtPayload }) {
    return this.businessService.findAll(req.user.sub);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.businessService.findOne(id, req.user.sub);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBusinessDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.businessService.update(id, req.user.sub, dto);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.businessService.remove(id, req.user.sub);
  }
}
