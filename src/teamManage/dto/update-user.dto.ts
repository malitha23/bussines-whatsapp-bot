import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { UserRole, UserStatus } from '../../database/entities/user.entity';

export class UpdateUserDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsOptional() 
  password!: string; // mandatory

  @IsOptional()
  @IsString()
  phone?: string;

  @IsEnum(UserRole)
  @IsNotEmpty()
  role_type!: UserRole;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @IsOptional()
  custom_permissions?: string[];
}
