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
import { LoginDto } from './dto/login.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppSession } from '../database/entities/whatsapp-session.entity';
import { BotMessageGateway } from '../gateway/bot-message.gateway';
import * as botJson from '../data/bot_messages.json';
import { BotMessage } from '../database/entities/bot-messages.entity';
import { readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private botMessageGateway: BotMessageGateway,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    @InjectRepository(WhatsAppSession)
    private readonly whatsappSessionRepository: Repository<WhatsAppSession>,
    @InjectRepository(BotMessage)
    private readonly botMessageRepository: Repository<BotMessage>,
  ) { }

  // ---------------------------
  // Register a new owner
  // ---------------------------
  async register(
    registerDto: RegisterDto
  ): Promise<{ user: any; tokens: any, businessId: any }> {
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

    let business: Business | null = null;

    // Create business if info is provided
    if (registerDto.businessName && registerDto.businessEmail && registerDto.address) {
      business = await this.usersService.createBusiness({
        name: registerDto.businessName,
        email: registerDto.businessEmail,
        phone: registerDto.phone || '',
        address: registerDto.address,
        owner: user,
      });
    }

    // Generate tokens (same as login)
    const tokens = await this.login(user);

    // Check WhatsApp session
    let whatsappConnected = false;

    if (business) {
      // Find an active session for the business
      const activeSession = await this.whatsappSessionRepository.findOne({
        where: { business: { id: business.id }, is_active: true },
      });

      // Check if session_data is 'connected'
      whatsappConnected = activeSession?.session_data === 'connected';
    }

    // SAME FORMAT AS LOGIN
    const responseUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role_type: user.role_type,
      businessId: business?.id?.toString() || null,
      isApproved: business?.is_active ?? false,
      whatsappConnected,
    };

    if (business) {
      this.importBotMessages(business.id); // no await, runs asynchronously
    }

    return { user: responseUser, tokens, businessId: business?.id?.toString() };
  }

  // Separate async function to import messages and send progress
  private async importBotMessages(businessId: number) {
  const filePath = join(__dirname, '../data/bot_messages.json');
  const fileContent = readFileSync(filePath, 'utf-8');
  const jsonMessages = JSON.parse(fileContent) as any[];

  if (!Array.isArray(jsonMessages) || jsonMessages.length === 0) {
    console.warn('No bot messages found in bot_messages.json');
    return;
  }

  const total = jsonMessages.length;
  let inserted = 0;

  for (const item of jsonMessages) {
    const newRecord = this.botMessageRepository.create({
      business_id: businessId,
      language: item.language,
      key_name: item.key_name,
      text: item.text,
    });
  
    await this.botMessageRepository.save(newRecord);

    inserted++;
    const percent = Math.round((inserted / total) * 100);
    this.botMessageGateway.sendProgress(businessId, percent);
  }

  this.botMessageGateway.sendComplete(businessId);
}


  async loginUser(loginDto: LoginDto) {
    // Validate user credentials
    const user = await this.validateUser(loginDto.email, loginDto.password);

    // Generate tokens
    const tokens = await this.login(user);

    // Fetch user's business
    const business = await this.businessRepository.findOne({
      where: { owner: { id: user.id } },
      relations: ['owner'],
    });

    // Check WhatsApp session
    let whatsappConnected = false;

    if (business) {
      // Find an active session for the business
      const activeSession = await this.whatsappSessionRepository.findOne({
        where: { business: { id: business.id }, is_active: true },
      });

      // Check if session_data is 'connected'
      whatsappConnected = activeSession?.session_data === 'connected';
    }

    // Prepare the response user object
    const responseUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role_type: user.role_type,
      businessId: business?.id?.toString() || null,
      isApproved: business?.is_active ?? false,
      whatsappConnected,
    };

    return { user: responseUser, tokens };
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
      expiresIn: '3min',
    });

    const refresh_token = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    return { access_token, refresh_token };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.usersService.findOne(payload.sub);
      if (!user) throw new UnauthorizedException("User not found");

      const newAccessToken = await this.jwtService.signAsync(
        { sub: user.id, email: user.email, role: user.role_type },
        { secret: process.env.JWT_SECRET, expiresIn: "15m" }
      );

      return { access_token: newAccessToken };

    } catch (e) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }

}
