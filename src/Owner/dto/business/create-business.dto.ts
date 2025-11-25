import { IsString, IsEmail, IsOptional } from 'class-validator';

export class CreateBusinessDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  phone!: string;

  @IsString()
  @IsOptional()
  address?: string;
}
