import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { SubcategoryService } from './subcategory.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, Roles } from '../../guards/role.guard';
import { Request } from 'express';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Controller('business/subcategory')
@UseGuards(JwtAuthGuard, RoleGuard)
export class SubcategoryController {
  constructor(private readonly subcategoryService: SubcategoryService) {}

  @Post()
  @Roles('owner', 'manager', 'staff')
  createSubcategory(
    @Body('name') name: string,
    @Body('categoryId', ParseIntPipe) categoryId: number,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.subcategoryService.createSubcategory(name, categoryId, req.user.email);
  }

  @Get()
  @Roles('owner', 'manager', 'staff')
  getAllSubcategories() {
    return this.subcategoryService.getAllSubcategories();
  }

  @Get(':id')
  @Roles('owner', 'manager', 'staff')
  getSubcategory(@Param('id', ParseIntPipe) id: number) {
    return this.subcategoryService.getSubcategory(id);
  }

  @Patch(':id')
  @Roles('owner', 'manager')
  updateSubcategory(
    @Req() req: Request & { user: JwtPayload },
    @Param('id', ParseIntPipe) id: number,
    @Body('name') name: string,
  ) {
    return this.subcategoryService.updateSubcategory(id, name, req.user.email);
  }

  @Delete(':id')
  @Roles('owner') // Only owner can delete
  deleteSubcategory(@Param('id', ParseIntPipe) id: number, @Req() req: Request & { user: JwtPayload },) {
    return this.subcategoryService.deleteSubcategory(id, req.user.email);
  }
}
