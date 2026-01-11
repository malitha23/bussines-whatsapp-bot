import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessDeliveryFee } from '../../database/entities/business-delivery-fee.entity';
import { Business } from '../../database/entities/business.entity';
import { Manager } from '../../database/entities/managers.entity';
import { Staff } from '../../database/entities/staff.entity';
import { User } from '../../database/entities/user.entity';
import { TeamActivityService } from '../../team-activity/team-activity.service';

@Injectable()
export class DeliveryFeeService {
  constructor(
    @InjectRepository(BusinessDeliveryFee)
    private readonly feeRepo: Repository<BusinessDeliveryFee>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Manager)
    private readonly managerRepo: Repository<Manager>,
    @InjectRepository(Staff)
    private readonly staffRepo: Repository<Staff>,
    private readonly activityService: TeamActivityService,
  ) {}

  // ---------------------------------------
  // Resolve business by logged-in user
  // ---------------------------------------
  private async getBusinessByUser(email: string): Promise<{ user: User; business: Business }> {
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

    return { user, business };
  }

  // ---------------------------------------
  // CREATE
  // ---------------------------------------
  async create(data: Partial<BusinessDeliveryFee>, email: string) {
    const { user, business } = await this.getBusinessByUser(email);

    const fee = this.feeRepo.create({
      ...data,
      business,
    });

    const saved = await this.feeRepo.save(fee);

    await this.activityService.logActivity(
      user,
      business,
      `created delivery fee (${saved.unit_type}: ${saved.min_value} - ${saved.max_value})`,
    );

    return saved;
  }

  // ---------------------------------------
  // LIST
  // ---------------------------------------
  async findAll(email: string) {
    const { business } = await this.getBusinessByUser(email);

    return this.feeRepo.find({
      where: { business: { id: business.id } },
      order: { min_value: 'ASC' },
    });
  }

  // ---------------------------------------
  // UPDATE
  // ---------------------------------------
  async update(id: number, data: Partial<BusinessDeliveryFee>, email: string) {
    const { user, business } = await this.getBusinessByUser(email);

    const fee = await this.feeRepo.findOne({
      where: { id, business: { id: business.id } },
    });

    if (!fee) throw new NotFoundException('Delivery fee not found');

    Object.assign(fee, data);
    const updated = await this.feeRepo.save(fee);

    await this.activityService.logActivity(
      user,
      business,
      `updated delivery fee (${updated.unit_type}: ${updated.min_value} - ${updated.max_value})`,
    );

    return updated;
  }

  // ---------------------------------------
  // DELETE
  // ---------------------------------------
  async remove(id: number, email: string) {
    const { user, business } = await this.getBusinessByUser(email);

    const fee = await this.feeRepo.findOne({
      where: { id, business: { id: business.id } },
    });

    if (!fee) throw new NotFoundException('Delivery fee not found');

    await this.feeRepo.remove(fee);

    await this.activityService.logActivity(
      user,
      business,
      `deleted delivery fee (${fee.unit_type}: ${fee.min_value} - ${fee.max_value})`,
    );

    return { message: 'Delivery fee deleted' };
  }
}
