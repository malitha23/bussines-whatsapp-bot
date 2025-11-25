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
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OwnerRoleGuard } from '../guards/owner-role.guard';
import { Request } from 'express';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';

@Controller('owner/inventory')
@UseGuards(JwtAuthGuard, OwnerRoleGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // 🟩 PRODUCT CRUD ---------------------------------
  @Post('product')
  createProduct(@Body() dto: any, @Req() req: Request & { user: JwtPayload }) {
    // You can attach businessId if needed
    return this.inventoryService.createProduct({
      ...dto,
      business: { id: req.user.sub },
    });
  }

  @Get('products')
  getAllProducts() {
    return this.inventoryService.getAllProducts();
  }

  @Get('product/:id')
  getProduct(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.getProduct(id);
  }

  @Patch('product/:id')
  updateProduct(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.inventoryService.updateProduct(id, dto);
  }

  @Delete('product/:id')
  deleteProduct(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.deleteProduct(id);
  }

  // 🟦 VARIANTS ---------------------------------
  @Post('product/:productId/variant')
  addVariant(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: any,
  ) {
    return this.inventoryService.addVariant(productId, dto);
  }

// ✅ Upload single variant image
@Post('variant/:variantId/image')
@UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
async uploadVariantImage(
  @Param('variantId', ParseIntPipe) variantId: number,
  @UploadedFile(
    new ParseFilePipeBuilder()
      .addFileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ })
      .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 }) // 5 MB per file
      .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
  )
  file: Express.Multer.File,
) {
  return this.inventoryService.addVariantImage(variantId, file);
}

// ✅ Upload multiple variant images
@Post('variant/:variantId/images')
@UseInterceptors(FilesInterceptor('files', 10, { storage: multer.memoryStorage() }))
async uploadVariantImages(
  @Param('variantId', ParseIntPipe) variantId: number,
  @UploadedFiles(
    new ParseFilePipeBuilder()
      .addFileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ })
      .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 }) // 5 MB per file
      .build({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY }),
  )
  files: Express.Multer.File[],
) {
  return this.inventoryService.addMultipleVariantImages(variantId, files);
}


  // 🟧 STOCK ---------------------------------
  @Post('variant/:variantId/stock')
  updateStock(
    @Param('variantId', ParseIntPipe) variantId: number,
    @Body('quantity', ParseIntPipe) quantity: number,
    @Body('location') location?: string,
  ) {
    return this.inventoryService.updateStock(variantId, quantity, location);
  }

  // 🟥 TRANSACTIONS ---------------------------------
  @Post('product/:productId/transaction')
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
