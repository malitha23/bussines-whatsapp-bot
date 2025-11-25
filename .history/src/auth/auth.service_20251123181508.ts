import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/user.service';
import { RegisterDto } from './dto/register.dto';
import { User } from '../database/entities/user.entity';

import { JwtPayload } from './interfaces/jwt-payload.interface';
import { Business } from '../database/entities/business.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  // ---------------------------
  // Register a new owner
  // ---------------------------
   async register(registerDto: RegisterDto): Promise<{ user: Omit<User, 'password'>; businessId?: number }> {
    // Check existing user
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) throw new ConflictException('Email already exists');

    if (!registerDto.password || registerDto.password.length < 6) {
      throw new ConflictException('Password must be at least 6 characters');
    }

    if (registerDto.password !== registerDto.confirmPassword) {
      throw new ConflictException('Passwords do not match');
    }

    if (!registerDto.role_type) registerDto.role_type = 'owner';

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 12);

    // Create user
    const user: User = await this.usersService.create({
      name: registerDto.name,
      email: registerDto.email,
      password: hashedPassword,
      phone: registerDto.phone,
      role_type: registerDto.role_type,
    });

    let businessId: number | undefined;

    // Create business if info is provided
    if (registerDto.businessName && registerDto.businessEmail && registerDto.address) {
      const business: Business = await this.usersService.createBusiness({
        name: registerDto.businessName,
        email: registerDto.businessEmail,
        phone: registerDto.phone || '',
        address: registerDto.address,
        owner: user,
      });
      businessId = business.id;
    }

    const { password, ...safeUser } = user;
    return { user: safeUser, businessId };
  }


  // ---------------------------
  // Validate user credentials
  // ---------------------------
  async validateUser(
    email: string,
    password: string,
  ): Promise<Omit<User, 'password'>> {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.password)
      throw new InternalServerErrorException('Password missing');

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      throw new UnauthorizedException('Invalid credentials');

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pass, ...safeUser } = user;
    return safeUser;
  }

  // ---------------------------
  // Login and generate JWT
  // ---------------------------
  async login(user: Omit<User, 'password'>) {
    const payload = { sub: user.id, email: user.email, role: user.role_type };

    const access_token = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '1h',
    });

    const refresh_token = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    return { access_token, refresh_token };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        { secret: process.env.JWT_REFRESH_SECRET },
      );

      // Find the user
      const user = await this.usersService.findOne(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new access token
      const newAccessToken = await this.jwtService.signAsync(
        { sub: user.id, email: user.email, role: user.role_type },
        { secret: process.env.JWT_SECRET, expiresIn: '1h' },
      );

      return {
        access_token: newAccessToken,
      };
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
