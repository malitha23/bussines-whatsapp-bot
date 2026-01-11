import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Business } from '../database/entities/business.entity';
import { TeamActivity } from '../database/entities/team-activity.entity';
import { User } from '../database/entities/user.entity';
import { Manager } from '../database/entities/managers.entity';
import { Staff } from '../database/entities/staff.entity';

@Injectable()
export class TeamActivityService {
    constructor(
        @InjectRepository(TeamActivity)
        private readonly activityRepo: Repository<TeamActivity>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(Manager)
        private readonly managerRepo: Repository<Manager>,
        @InjectRepository(Staff)
        private readonly staffRepo: Repository<Staff>,
        @InjectRepository(Business)
        private readonly businessRepo: Repository<Business>,

    ) { }

    /**
     * Logs a team activity
     * @param user - User performing the action
     * @param business - Business related to the action
     * @param action - Description of the action
     */

    // -------------------------------------------------------
    // Get Business by user
    // -------------------------------------------------------
    private async getBusinessIdByUser(email: string): Promise<number> {
        const user = await this.userRepo.findOne({ where: { email } });
        if (!user) throw new NotFoundException('User not found');

        let business;

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
            business = manager?.business;
        } else if (user.role_type === 'staff') {
            const staff = await this.staffRepo.findOne({
                where: { user: { id: user.id } },
                relations: ['business'],
            });
            business = staff?.business;
        }

        if (!business) throw new NotFoundException('Business not found for this user');
        return business.id;
    }

    async logActivity(user: User, business: Business, action: string): Promise<TeamActivity> {
        const activity = this.activityRepo.create({ user, business, action });
        return await this.activityRepo.save(activity);
    }

    /**
     * Fetch recent activities for a business
     */


    async getRecentActivityWithCount(
        email: string,
        limit: number,
        page: number
    ): Promise<[TeamActivity[], number]> {
        const businessId = await this.getBusinessIdByUser(email);
        const [activities, total] = await this.activityRepo.findAndCount({
            where: { business: { id: businessId } },
            order: { created_at: 'DESC' },
            take: limit,
            skip: (page - 1) * limit,
            relations: ['user'],
        });
        return [activities, total];
    }

}
