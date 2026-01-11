import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessPaymentOption } from '../../database/entities/business-payment-options.entity';
import { Business } from '../../database/entities/business.entity';
import { User } from '../../database/entities/user.entity';
import { Manager } from '../../database/entities/managers.entity';
import { Staff } from '../../database/entities/staff.entity';

@Injectable()
export class PaymentOptionService {
  constructor(
    @InjectRepository(BusinessPaymentOption)
    private readonly optionRepo: Repository<BusinessPaymentOption>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Manager)
    private readonly managerRepo: Repository<Manager>,
    @InjectRepository(Staff)
    private readonly staffRepo: Repository<Staff>,
  ) {}

  // ---------------------------------------
  // Resolve business from logged-in user
  // ---------------------------------------
  private async getBusinessByUser(email: string): Promise<Business> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');

    let business: Business | null = null;

    if (user.role_type === 'owner') {
      business = await this.businessRepo.findOne({
        where: { owner: { id: user.id } },
        relations: ['owner'],
      });
    } else if (user.role_type === 'manager') {
      const manager = await this.managerRepo.findOne({
        where: { user: { id: user.id } },
        relations: ['business'],
      });
      business = manager?.business ?? null;
    } else if (user.role_type === 'staff') {
      const staff = await this.staffRepo.findOne({
        where: { user: { id: user.id } },
        relations: ['business'],
      });
      business = staff?.business ?? null;
    }

    if (!business) throw new NotFoundException('Business not found for this user');
    return business;
  }

  // ---------------------------------------
  // CREATE
  // ---------------------------------------
  async create(data: Partial<BusinessPaymentOption>, email: string) {
    const business = await this.getBusinessByUser(email);

    const option = this.optionRepo.create({
      ...data,
      business,
    });

    return this.optionRepo.save(option);
  }

  // ---------------------------------------
  // LIST
  // ---------------------------------------
  async findAll(email: string) {
    const business = await this.getBusinessByUser(email);

    return this.optionRepo.find({
      where: { business: { id: business.id } },
      order: { created_at: 'DESC' },
    });
  }

  // ---------------------------------------
  // UPDATE
  // ---------------------------------------
  async update(id: number, data: Partial<BusinessPaymentOption>, email: string) {
    const business = await this.getBusinessByUser(email);

    const option = await this.optionRepo.findOne({
      where: { id, business: { id: business.id } },
    });

    if (!option) throw new NotFoundException('Payment option not found');

    Object.assign(option, data);
    return this.optionRepo.save(option);
  }

  // ---------------------------------------
  // TOGGLE
  // ---------------------------------------
  async toggle(id: number, email: string) {
    const business = await this.getBusinessByUser(email);

    const option = await this.optionRepo.findOne({
      where: { id, business: { id: business.id } },
    });

    if (!option) throw new NotFoundException('Payment option not found');

    option.enabled = option.enabled ? 0 : 1;
    return this.optionRepo.save(option);
  }

  // ---------------------------------------
  // DELETE
  // ---------------------------------------
  async remove(id: number, email: string) {
    const business = await this.getBusinessByUser(email);

    const option = await this.optionRepo.findOne({
      where: { id, business: { id: business.id } },
    });

    if (!option) throw new NotFoundException('Payment option not found');

    await this.optionRepo.remove(option);
    return { message: 'Payment option deleted' };
  }
}
