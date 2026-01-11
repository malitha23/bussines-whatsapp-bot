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
import { SubSubCategoryService } from './subsubcategory.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, Roles } from '../../guards/role.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Controller('business/subsub-category')
@UseGuards(JwtAuthGuard, RoleGuard)
export class SubSubCategoryController {
  constructor(private readonly subSubCategoryService: SubSubCategoryService) {}

  @Post()
  @Roles('owner', 'manager', 'staff')
  createSubSubCategory(
    @Req() req: Request & { user: JwtPayload },
    @Body('name') name: string,
    @Body('subCategoryId', ParseIntPipe) subCategoryId: number,
  ) {
    return this.subSubCategoryService.createSubSubCategory(name, subCategoryId, req.user.email);
  }

  @Get()
  @Roles('owner', 'manager', 'staff')
  getAllSubSubCategories() {
    return this.subSubCategoryService.getAllSubSubCategories();
  }

  @Get(':id')
  @Roles('owner', 'manager', 'staff')
  getSubSubCategory(@Param('id', ParseIntPipe) id: number) {
    return this.subSubCategoryService.getSubSubCategory(id);
  }

  @Patch(':id')
  @Roles('owner', 'manager')
  updateSubSubCategory(@Req() req: Request & { user: JwtPayload }, @Param('id', ParseIntPipe) id: number, @Body('name') name: string) {
    return this.subSubCategoryService.updateSubSubCategory(id, name, req.user.email);
  }

  @Delete(':id')
  @Roles('owner')
  deleteSubSubCategory(@Param('id', ParseIntPipe) id: number, @Req() req: Request & { user: JwtPayload },) {
    return this.subSubCategoryService.deleteSubSubCategory(id, req.user.email);
  }
}
