import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
} from 'class-validator';

export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsNumber()
  price!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsNotEmpty()
  @IsNumber()
  businessId!: number;

  @IsNotEmpty()
  @IsNumber()
  subsubCategoryId!: number;

  // Optional product variants (e.g., size, color)
  @IsOptional()
  @IsArray()
  variants?: {
    name: string;
    sku: string;
    additional_price?: number;
  }[];

  // Optional product images
  @IsOptional()
  @IsArray()
  images?: string[];
}
