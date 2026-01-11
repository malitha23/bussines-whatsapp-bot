import { Controller, Get, Post, Patch, Delete, Param, Body, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { CategoryService } from './category.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, Roles } from '../../guards/role.guard';
import { Request } from 'express';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CreateCategoryDto } from './dto/category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('business/category')
@UseGuards(JwtAuthGuard, RoleGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @Roles('owner', 'manager', 'staff')
  async createCategory(@Body() dto: CreateCategoryDto, @Req() req: Request & { user: JwtPayload }) {
    return this.categoryService.createCategory(dto.name, req.user.email);
  }

  @Get()
  @Roles('owner', 'manager', 'staff')
  async getAllCategories(@Req() req: Request & { user: JwtPayload }) {
    return this.categoryService.getAllCategoriesByUser(req.user.email);
  }

  @Get(':id')
  @Roles('owner', 'manager', 'staff')
  async getCategory(@Param('id', ParseIntPipe) id: number) {
    return this.categoryService.getCategory(id);
  }

  @Patch(':id')
  @Roles('owner', 'manager')
  async updateCategory(@Req() req: Request & { user: JwtPayload }, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    return this.categoryService.updateCategory(id, dto.name, req.user.email);
  }

  @Delete(':id')
  @Roles('owner')
  async deleteCategory(@Req() req: Request & { user: JwtPayload }, @Param('id', ParseIntPipe) id: number) {
    return this.categoryService.deleteCategory(id, req.user.email);
  }
}
