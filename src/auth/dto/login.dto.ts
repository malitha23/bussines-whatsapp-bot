import { IsEmail, IsIn, IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email!: string;

  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password!: string;

  @IsNotEmpty({ message: 'Role is required' })
  @IsIn(['owner', 'manager', 'staff'], { message: 'Role must be owner, manager, or staff' })
  activeRole!: 'owner' | 'manager' | 'staff'; 
}
