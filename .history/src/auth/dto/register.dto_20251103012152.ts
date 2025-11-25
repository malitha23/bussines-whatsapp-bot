import { IsEmail, IsNotEmpty, MinLength, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @IsNotEmpty()
  @MinLength(6)
  confirmPassword!: string;

  @IsOptional()
  phone?: string;

  @IsOptional()
  role_type?: 'super_admin' | 'owner' | 'manager' | 'staff';
}
