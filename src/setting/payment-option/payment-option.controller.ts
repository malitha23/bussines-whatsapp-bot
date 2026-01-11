import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PaymentOptionService } from './payment-option.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, Roles } from '../../guards/role.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Controller('business/settings/payment')
@UseGuards(JwtAuthGuard, RoleGuard)
export class PaymentOptionController {
  constructor(private readonly service: PaymentOptionService) {}

  // CREATE
  @Post('payment-options')
  @Roles('owner', 'manager')
  create(
    @Req() req: Request & { user: JwtPayload },
    @Body() body: any,
  ) {
    return this.service.create(body, req.user.email);
  }

  // LIST
  @Get('payment-options')
  @Roles('owner', 'manager')
  findAll(@Req() req: Request & { user: JwtPayload }) {
    return this.service.findAll(req.user.email);
  }

  // UPDATE
  @Put('payment-options/:id')
  @Roles('owner', 'manager')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.update(id, body, req.user.email);
  }

  // ENABLE / DISABLE
  @Patch('payment-options/:id/toggle')
  @Roles('owner', 'manager')
  toggle(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.toggle(id, req.user.email);
  }

  // DELETE
  @Delete('payment-options/:id')
  @Roles('owner')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.service.remove(id, req.user.email);
  }
}
