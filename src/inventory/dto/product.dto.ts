// src/inventory/dto/create-product.dto.ts
import { IsNumber, IsOptional, IsString, IsPositive, IsBoolean } from 'class-validator';

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsNumber()
  @IsPositive()
  base_price!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  subCategoryId?: number;

  @IsOptional()
  @IsNumber()
  subsubCategoryId?: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean = true;
}
