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
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  ParseFilePipeBuilder,
  HttpStatus,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard, Roles } from '../guards/role.guard';
import { Request } from 'express';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { CreateProductDto } from './dto/product.dto';
import { CreateVariantDto } from './dto/variant.dto';
import { SearchFilterDto } from './dto/search-filter.dto';

@Controller('business/inventory')
@UseGuards(JwtAuthGuard, RoleGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) { }

  // 🟩 PRODUCT CRUD ---------------------------------
  @Post('product')
  @Roles('owner', 'manager', 'staff')
  createProduct(
    @Body() dto: CreateProductDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.inventoryService.createProduct({
      ...dto,
      email: req.user.email,
    });
  }


  @Get('products')
  @Roles('owner', 'manager', 'staff')
  getAllProducts(@Query() filters: SearchFilterDto, @Req() req: Request & { user: JwtPayload }) {
    return this.inventoryService.getAllProducts(filters, req.user.email);
  }

  @Get('products/filters')
  @Roles('owner', 'manager', 'staff')
  getFilters(@Req() req: Request & { user: JwtPayload }) {
    return this.inventoryService.getAvailableFiltersByUser(req.user.email);
  }

  @Get('product/:id')
  @Roles('owner', 'manager', 'staff')
  getProduct(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.getProduct(id);
  }

  @Patch('product/:id')
  @Roles('owner', 'manager', 'staff')
  updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @Req() req: Request & { user: JwtPayload }, // <-- Add @Req()
  ) {
    if (!req.user?.email) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.inventoryService.updateProduct(id, dto, req.user.email);
  }


  @Delete('product/:id')
  @Roles('owner', 'manager', 'staff')
  deleteProduct(@Param('id', ParseIntPipe) id: number, @Req() req: Request & { user: JwtPayload },) {
    return this.inventoryService.deleteProduct(id, req.user.email);
  }


  // Inside InventoryController
  @Get('dashboard-stats')
  @Roles('owner', 'manager', 'staff')
  async getDashboardStats(
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.inventoryService.getInventoryStats(req.user.email);
  }





  // 🟦 VARIANTS ---------------------------------
  @Post('product/:productId/variant')
  @Roles('owner', 'manager', 'staff')
  addVariant(
    @Req() req: Request & { user: JwtPayload },
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: CreateVariantDto,
  ) {
    return this.inventoryService.addVariant(productId, dto, req.user.email);
  }


  // ✅ Upload single variant image
  @Post('variant/:variantId/image')
  @Roles('owner', 'manager', 'staff')
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  async uploadVariantImage(
    @Req() req: Request & { user: JwtPayload },
    @Param('variantId', ParseIntPipe) variantId: number,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 }) // 5 MB per file
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    file: Express.Multer.File,
  ) {
    return this.inventoryService.addVariantImage(variantId, file, req.user.email);
  }

  // ✅ Upload multiple variant images
  @Post('variant/:variantId/images')
  @Roles('owner', 'manager', 'staff')
  @UseInterceptors(FilesInterceptor('files', 10, { storage: multer.memoryStorage() }))
  async uploadVariantImages(
    @Req() req: Request & { user: JwtPayload },
    @Param('variantId', ParseIntPipe) variantId: number,
    @UploadedFiles(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 }) // 5 MB per file
        .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
    )
    files: Express.Multer.File[],
  ) {
    return this.inventoryService.addMultipleVariantImages(variantId, files, req.user.email);
  }

  @Delete('variant/:variantId/image/:imageId')
  @Roles('owner', 'manager', 'staff')
  async deleteVariantImage(
    @Req() req: Request & { user: JwtPayload },
    @Param('variantId', ParseIntPipe) variantId: number,
    @Param('imageId', ParseIntPipe) imageId: number,
  ) {
    return this.inventoryService.deleteVariantImage(variantId, imageId, req.user.email);
  }

  @Patch('variant/:variantId/image/:imageId/main')
  @Roles('owner', 'manager', 'staff')
  async setMainVariantImage(
    @Req() req: Request & { user: JwtPayload },
    @Param('variantId', ParseIntPipe) variantId: number,
    @Param('imageId', ParseIntPipe) imageId: number,
  ) {
    return this.inventoryService.setMainVariantImage(variantId, imageId, req.user.email);
  }



  // UPDATE variant
  @Put('variant/:variantId')
  @Roles('owner', 'manager', 'staff')
  updateVariant(
    @Req() req: Request & { user: JwtPayload },
    @Param('variantId', ParseIntPipe) id: number,
    @Body() dto: CreateVariantDto,
  ) {
    return this.inventoryService.updateVariant(id, dto, req.user.email);
  }

  // DELETE variant
  @Delete('variant/:variantId')
  @Roles('owner', 'manager', 'staff')
  deleteVariant(@Param('variantId', ParseIntPipe) id: number, @Req() req: Request & { user: JwtPayload },) {
    return this.inventoryService.deleteVariant(id, req.user.email);
  }









  // 🟧 STOCK ---------------------------------
  @Post('variant/:variantId/stock')
  @Roles('owner', 'manager', 'staff')
  updateStock(
    @Param('variantId', ParseIntPipe) variantId: number,
    @Body('quantity', ParseIntPipe) quantity: number,
    @Body('location') location?: string,
  ) {
    return this.inventoryService.updateStock(variantId, quantity, location);
  }

  // 🟥 TRANSACTIONS ---------------------------------
  @Post('product/:productId/transaction')
  @Roles('owner', 'manager', 'staff')
  recordTransaction(
    @Param('productId', ParseIntPipe) productId: number,
    @Body('type') type: 'IN' | 'OUT',
    @Body('quantity', ParseIntPipe) quantity: number,
    @Body('note') note?: string,
  ) {
    return this.inventoryService.recordTransaction(
      productId,
      type,
      quantity,
      note,
    );
  }
}
