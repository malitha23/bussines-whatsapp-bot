import { IsOptional, IsString, IsDateString } from 'class-validator';
  
export class UpdateTrackingDto {
  @IsOptional()
  @IsString()
  tracking_number?: string;

  @IsOptional()
  @IsString()
  carrier?: string;

  @IsOptional()
  @IsDateString()
  estimated_delivery?: string;

  @IsOptional()
  @IsString()
  additional_note?: string;
}
