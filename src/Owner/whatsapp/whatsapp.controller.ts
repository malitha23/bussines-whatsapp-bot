import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OwnerRoleGuard } from '../guards/owner-role.guard';
import { BusinessMemberGuard } from '../guards/business-member.guard';
import { WhatsAppService } from './whatsapp.service';
import { Request, Response } from 'express';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { WhatsAppClientManager } from './service/whatsapp-client.manager';
import { join } from 'path';
import * as fs from 'fs';

interface UserRequest extends Request {
  user: JwtPayload;
}

@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly waService: WhatsAppService,
    private readonly whatsAppClientManager: WhatsAppClientManager,
  ) {}

  // ---------------- Owner Routes ----------------
  @UseGuards(JwtAuthGuard, OwnerRoleGuard)
  @Get('owner/connect/:businessId')
  async connect(
    @Param('businessId', ParseIntPipe) businessId: number,
    @Req() req: UserRequest,
  ) {
    return await this.waService.initClient(businessId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard, OwnerRoleGuard)
  @Get('owner/stop/:businessId')
  async stop(@Param('businessId', ParseIntPipe) businessId: number) {
    return await this.whatsAppClientManager.stopClient(businessId);
  }

  @UseGuards(JwtAuthGuard, OwnerRoleGuard)
  @Get('owner/status/:businessId')
  status(@Param('businessId', ParseIntPipe) businessId: number) {
    const connected = this.whatsAppClientManager.isConnected(businessId);
    return { businessId, connected };
  }

  // ---------------- Staff/Manager Routes ----------------
  @UseGuards(JwtAuthGuard, BusinessMemberGuard)
  @Post('send')
  async sendMessage(
    @Body() body: { businessId: number; phone: string; message: string },
  ) {
    return await this.whatsAppClientManager.sendMessage(
      body.businessId,
      body.phone,
      body.message,
    );
  }

  // ---------------- Public File Access Route ----------------
  @Get('uploads/business_:businessId/payments/:customerId/:orderId/:fileName')
  async getPaymentReceipt(
    @Param('businessId') businessId: string,
    @Param('customerId') customerId: string,
    @Param('orderId') orderId: string,
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    const filePath = join(
      process.cwd(),
      'uploads',
      `business_${businessId}`,
      'payments',
      customerId,
      orderId,
      fileName,
    );

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    return res.sendFile(filePath);
  }
}



// import {
//   Controller,
//   Get,
//   Post,
//   Body,
//   Param,
//   Req,
//   UseGuards,
//   ParseIntPipe,
//   Res,
//   NotFoundException,
// } from '@nestjs/common';
// import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
// import { OwnerRoleGuard } from '../guards/owner-role.guard';
// import { BusinessMemberGuard } from '../guards/business-member.guard';
// import { WhatsAppService } from './whatsapp.service';
// import { Request, Response } from 'express';
// import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
// import { WhatsAppClientManager } from './service/whatsapp-client.manager';
// import { join } from 'path';
// import * as fs from 'fs';

// // Extend Express Request to include user
// interface UserRequest extends Request {
//   user: JwtPayload;
// }

// @Controller('whatsapp')
// export class WhatsAppController {
//   constructor(
//     private readonly waService: WhatsAppService,
//     private whatsAppClientManager: WhatsAppClientManager,
//   ) {}

//   // ---------------- Owner Routes ----------------
//   @UseGuards(JwtAuthGuard, OwnerRoleGuard)
//   @Get('owner/connect/:businessId')
//   async connect(
//     @Param('businessId', ParseIntPipe) businessId: number,
//     @Req() req: UserRequest,
//   ) {
//     return await this.waService.initClient(businessId, req.user.sub);
//   }

//   @UseGuards(JwtAuthGuard, OwnerRoleGuard)
//   @Get('owner/stop/:businessId')
//   async stop(@Param('businessId', ParseIntPipe) businessId: number) {
//     // Only owner can stop
//     return await this.whatsAppClientManager.stopClient(businessId);
//   }

//   @UseGuards(JwtAuthGuard, OwnerRoleGuard)
//   @Get('owner/status/:businessId')
//   status(@Param('businessId', ParseIntPipe) businessId: number) {
//     const connected = this.whatsAppClientManager.isConnected(businessId);
//     return { businessId, connected };
//   }

//   // ---------------- Staff/Manager Routes ----------------
//   @UseGuards(JwtAuthGuard, BusinessMemberGuard)
//   @Post('send')
//   async sendMessage(
//     @Body() body: { businessId: number; phone: string; message: string },
//   ) {
//     return await this.whatsAppClientManager.sendMessage(
//       body.businessId,
//       body.phone,
//       body.message,
//     );
//   }

//   // ---------------- Public File Access Route ----------------
//   @Get('uploads/business_:businessId/payments/:customerId/:orderId/:fileName')
//   async getPaymentReceipt(
//     @Param('businessId') businessId: string,
//     @Param('customerId') customerId: string,
//     @Param('orderId') orderId: string,
//     @Param('fileName') fileName: string,
//     @Res() res: Response,
//   ) {
//     const filePath = join(
//       process.cwd(),
//       'uploads',
//       `business_${businessId}`,
//       'payments',
//       customerId,
//       orderId,
//       fileName,
//     );

//     if (!fs.existsSync(filePath)) {
//       throw new NotFoundException('File not found');
//     }

//     return res.sendFile(filePath);
//   }
// }
