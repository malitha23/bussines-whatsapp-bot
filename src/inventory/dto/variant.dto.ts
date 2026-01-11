import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InventoryStockDto {
  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsString()
  @IsOptional()
  location?: string = 'warehouse';
}

export class CreateVariantDto {
  @IsString()
  variant_name!: string;

  @IsNumber()
  price!: number;

  @IsNumber()
  @Min(0)
  stock!: number;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  sku?: string;

  @IsString()
  @IsOptional()
  unit?: string = 'pcs';

  @IsBoolean()
  @IsOptional()
  is_active?: boolean = true;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryStockDto)
  inventory!: InventoryStockDto[];
}
