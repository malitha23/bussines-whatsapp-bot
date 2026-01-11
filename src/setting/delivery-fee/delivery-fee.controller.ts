import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { DeliveryFeeService } from './delivery-fee.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, Roles } from '../../guards/role.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
 
@Controller('business/settings/delivery')
@UseGuards(JwtAuthGuard, RoleGuard)
export class DeliveryFeeController {
  constructor(private readonly service: DeliveryFeeService) {}

  // CREATE
  @Post('delivery-fees')
  @Roles('owner', 'manager')
  create(
    @Req() req: Request & { user: JwtPayload },
    @Body() body: any,
  ) {
    return this.service.create(body, req.user.email);
  }

  // LIST
  @Get('delivery-fees')
  @Roles('owner', 'manager')
  findAll(@Req() req: Request & { user: JwtPayload }) {
    return this.service.findAll(req.user.email);
  }

  // UPDATE
  @Put('delivery-fees/:id')
  @Roles('owner', 'manager')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.update(id, body, req.user.email);
  }

  // DELETE
  @Delete('delivery-fees/:id')
  @Roles('owner', 'manager')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.remove(id, req.user.email);
  }
}
