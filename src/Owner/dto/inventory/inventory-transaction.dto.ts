import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
} from 'class-validator';

export enum TransactionType {
  IN = 'IN',
  OUT = 'OUT',
}

export class InventoryTransactionDto {
  @IsNotEmpty()
  @IsNumber()
  productId!: number;

  @IsOptional()
  @IsNumber()
  variantId?: number;

  @IsNotEmpty()
  @IsEnum(TransactionType)
  type!: TransactionType; // 'IN' = stock added, 'OUT' = stock reduced

  @IsNotEmpty()
  @IsNumber()
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
