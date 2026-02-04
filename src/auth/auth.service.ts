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

import { RolePermission } from '../database/entities/role-permission.entity';
import { Role } from '../database/entities/role.entity';
import { Permission } from '../database/entities/permission.entity';
import { Manager } from '../database/entities/managers.entity';
import { Staff } from '../database/entities/staff.entity';
import { BusinessPaymentOption } from '../database/entities/business-payment-options.entity';

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
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepository: Repository<RolePermission>,
    @InjectRepository(Manager)
    private readonly managerRepository: Repository<Manager>,
    @InjectRepository(Staff)
    private readonly staffRepository: Repository<Staff>,
    @InjectRepository(BusinessPaymentOption)
    private readonly businessPaymentOptionRepository: Repository<BusinessPaymentOption>
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
        is_active: true
      });
    }

    if (business) {
      // Fetch the role entity for this user
      const role = await this.getRoleByName(user.role_type);

      // Fetch all active permissions
      const allPermissions = await this.getAllPermissions();

      // Assign all permissions for this business
      for (const perm of allPermissions) {
        const exists = await this.getRolePermission(role!.id, perm.id, business.id);
        if (!exists) {
          await this.createRolePermission(role!, perm, business);
        }
      }
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

    let permissions: string[] = [];
    if (business) {
      const rolePermissions = await this.getRolePermissionsByRoleAndBusiness(user.role_type, business.id);
      permissions = rolePermissions.map(rp => rp.permission.name);
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
      userAccActive: business?.is_active ?? false,
      whatsappConnected,
      permissions
    };

    if (business) {
      this.importBotMessagesAndPaymentOptions(business.id); // no await, runs asynchronously
    }

    return { user: responseUser, tokens, businessId: business?.id?.toString() };
  }

  // Separate async function to import messages and send progress
  private async importBotMessagesAndPaymentOptions(businessId: number) {
    const filePath = join(__dirname, '../data/bot_messages.json');
    const fileContent = readFileSync(filePath, 'utf-8');
    const jsonMessages = JSON.parse(fileContent) as any[];

    const paymentOptions = [
      { option_name: 'Card Payment', key_name: 'card', enabled: 0 },
      { option_name: 'Bank Deposit', key_name: 'deposit', enabled: 1 },
      { option_name: 'Cash on Delivery', key_name: 'cod', enabled: 1 },
    ];

    const total = (jsonMessages?.length || 0) + paymentOptions.length;
    let inserted = 0;

    if (!Array.isArray(jsonMessages) || jsonMessages.length === 0) {
      console.warn('No bot messages found in bot_messages.json');
    } else {
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
    }

    for (const option of paymentOptions) {
      const newRecord = this.businessPaymentOptionRepository.create({
        business: { id: businessId },
        option_name: option.option_name,
        key_name: option.key_name,
        enabled: option.enabled,
      });

      await this.businessPaymentOptionRepository.save(newRecord);
      inserted++;
      const percent = Math.round((inserted / total) * 100);
      this.botMessageGateway.sendProgress(businessId, percent);
    }

    this.botMessageGateway.sendComplete(businessId);
  }



  async loginUser(loginDto: LoginDto) {
    // Validate user credentials
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (user.role_type !== loginDto.activeRole) {
      throw new UnauthorizedException(
        `You are not authorized as ${loginDto.activeRole}`,
      );
    }
    // Generate tokens
    const tokens = await this.login(user);

    // Fetch user's business 
    let business;
    let userAccActive;
    if (user?.role_type === 'owner') {
      business = await this.businessRepository.findOne({
        where: { owner: { id: user?.id } },
        relations: ['owner'],
      });
      userAccActive = business?.is_active;
    } else if (user?.role_type === 'manager') {
      const manager = await this.managerRepository.findOne({
        where: { user: { id: user?.id } },
        relations: ['business', 'user'],
      });
      business = manager?.business;
      userAccActive = manager?.is_active;
    } else if (user?.role_type === 'staff') {
      const staff = await this.staffRepository.findOne({
        where: { user: { id: user?.id } },
        relations: ['business', 'user'],
      });
      business = staff?.business;
      userAccActive = staff?.is_active;
    }
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

    let permissions: string[] = [];
    if (business) {
      const rolePermissions = await this.getRolePermissionsByRoleAndBusiness(user.role_type, business.id);
      permissions = rolePermissions.map(rp => rp.permission.name);
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
      userAccActive,
      whatsappConnected,
      permissions
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
      expiresIn: '7d',
    });

    const refresh_token = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '30d',
    });

    return { access_token, refresh_token };
  }

  async getUserWithPermissions(userData: User | JwtPayload) {


    const user = await this.usersService.findByEmail(userData.email);
    let business;
    let userAccActive;
    if (user?.role_type === 'owner') {
      business = await this.businessRepository.findOne({
        where: { owner: { id: user?.id } },
        relations: ['owner'],
      });
      userAccActive = business?.is_active;
    } else if (user?.role_type === 'manager') {
      const manager = await this.managerRepository.findOne({
        where: { user: { id: user?.id } },
        relations: ['business', 'user'],
      });
      business = manager?.business;
      userAccActive = manager?.is_active;
    } else if (user?.role_type === 'staff') {
      const staff = await this.staffRepository.findOne({
        where: { user: { id: user?.id } },
        relations: ['business', 'user'],
      });
      business = staff?.business;
      userAccActive = staff?.is_active;
    }


    let whatsappConnected = false;
    if (business) {
      const activeSession = await this.whatsappSessionRepository.findOne({
        where: { business: { id: business.id }, is_active: true },
      });
      whatsappConnected = activeSession?.session_data === 'connected';
    }



    let permissions: string[] = [];
    if (business) {
      const role = await this.getRoleByName(user!.role_type);
      const rolePermissions = await this.rolePermissionRepository.find({
        where: { role: { id: role!.id }, business: { id: business.id }, status: 1 },
        relations: ['permission'],
      });
      permissions = rolePermissions.map(rp => rp.permission.name);
    }

    return {
      id: user?.id,
      name: user?.name,
      email: user?.email,
      phone: user?.phone,
      role_type: user?.role_type,
      businessId: business?.id?.toString() || null,
      isApproved: business?.is_active ?? false,
      userAccActive,
      whatsappConnected,
      permissions,
    };
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


  // Get role by name
  async getRoleByName(roleName: string) {
    return this.roleRepository.findOne({ where: { name: roleName } });
  }

  // Get all permissions
  async getAllPermissions() {
    return this.permissionRepository.find({ where: { status: 1 } }); // only active
  }

  // Check if RolePermission exists for a specific business
  async getRolePermission(roleId: number, permissionId: number, businessId: number) {
    return this.rolePermissionRepository.findOne({
      where: {
        role: { id: roleId },
        permission: { id: permissionId },
        business: { id: businessId },
      },
    });
  }

  // Create RolePermission for a specific business
  async createRolePermission(role: Role, permission: Permission, business: Business) {
    const rp = this.rolePermissionRepository.create({
      role,
      permission,
      business,
      status: 1
    });
    return this.rolePermissionRepository.save(rp);
  }

  // users.service.ts
  async getRolePermissionsByRoleAndBusiness(roleName: string, businessId: number) {
    const role = await this.roleRepository.findOne({ where: { name: roleName } });
    if (!role) return [];

    return this.rolePermissionRepository.find({
      where: {
        role: { id: role.id },
        business: { id: businessId },
        status: 1, // only active
      },
      relations: ['permission'],
    });
  }



}
