import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Business } from '../../database/entities/business.entity';
import { User } from '../../database/entities/user.entity';
import { Manager } from '../../database/entities/managers.entity';
import { Staff } from '../../database/entities/staff.entity';
import { BotMessage } from '../../database/entities/bot-messages.entity';
import { readFileSync } from 'fs';
import { join } from 'path';


@Injectable()
export class BusinessService {
    constructor(
        @InjectRepository(Business)
        private readonly businessRepo: Repository<Business>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(Manager)
        private readonly managerRepo: Repository<Manager>,
        @InjectRepository(Staff)
        private readonly staffRepo: Repository<Staff>,
        @InjectRepository(BotMessage) // Add this
        private readonly botMessageRepo: Repository<BotMessage>,
    ) { }

    // Resolve business from logged-in user
    // Get business basic info for logged-in user (no paymentOptions)
    async getBusinessByUser(email: string): Promise<Business> {
        const user = await this.userRepo.findOne({ where: { email } });
        if (!user) throw new NotFoundException('User not found');

        let business: Business | null = null;

        if (user.role_type === 'owner') {
            business = await this.businessRepo.findOne({
                where: { owner: { id: user.id } },
                relations: ['owner'], // no paymentOptions
            });
        } else if (user.role_type === 'manager') {
            const manager = await this.managerRepo.findOne({
                where: { user: { id: user.id } },
                relations: ['business'], // no paymentOptions
            });
            business = manager?.business ?? null;
        } else if (user.role_type === 'staff') {
            const staff = await this.staffRepo.findOne({
                where: { user: { id: user.id } },
                relations: ['business'], // no paymentOptions
            });
            business = staff?.business ?? null;
        }

        if (!business) throw new NotFoundException('Business not found for this user');
        return business;
    }


    // Update business info by user email
    async updateBusinessInfoByUserEmail(
        email: string,
        data: Partial<Pick<Business, 'name' | 'email' | 'phone' | 'address'>>,
    ): Promise<Business> {
        const business = await this.getBusinessByUser(email);
        Object.assign(business, data);
        return this.businessRepo.save(business);
    }


    // 1. Get all bot messages for a business
    async getBotMessages(businessId: number): Promise<BotMessage[]> {
        return this.botMessageRepo.find({
            where: { business_id: businessId },
            order: { key_name: 'ASC', language: 'ASC' },
        });
    }

    // 2. Get bot messages by language
    async getBotMessagesByLanguage(businessId: number, language: string): Promise<BotMessage[]> {
        return this.botMessageRepo.find({
            where: {
                business_id: businessId,
                language: language as 'en' | 'si' | 'ta'
            },
            order: { key_name: 'ASC' },
        });
    }

    // 3. Get bot messages by key name
    async getBotMessagesByKey(businessId: number, keyName: string): Promise<BotMessage[]> {
        return this.botMessageRepo.find({
            where: { business_id: businessId, key_name: keyName },
            order: { language: 'ASC' },
        });
    }

    // 4. Get specific bot message (single record)
    async getBotMessage(businessId: number, id: number): Promise<BotMessage> {
        const message = await this.botMessageRepo.findOne({
            where: { id, business_id: businessId },
        });
        if (!message) {
            throw new NotFoundException('Bot message not found');
        }
        return message;
    }

    // 5. Update bot message text
    async updateBotMessage(
        businessId: number,
        id: number,
        text: string
    ): Promise<BotMessage> {
        const message = await this.getBotMessage(businessId, id);
        message.text = text;
        return this.botMessageRepo.save(message);
    }

    // 6. Bulk update bot messages (update multiple at once)
    async bulkUpdateBotMessages(
        businessId: number,
        updates: Array<{ id: number; text: string }>
    ): Promise<BotMessage[]> {
        const updatedMessages: BotMessage[] = [];

        for (const update of updates) {
            try {
                const message = await this.getBotMessage(businessId, update.id);
                message.text = update.text;
                const updated = await this.botMessageRepo.save(message);
                updatedMessages.push(updated);
            } catch (error) {
                // Continue with other updates even if one fails
                console.error(`Failed to update message ${update.id}:`, error);
            }
        }

        return updatedMessages;
    }

    // 7. Get bot message by key and language
    async getBotMessageByKeyAndLanguage(
        businessId: number,
        keyName: string,
        language: string
    ): Promise<BotMessage> {
        const message = await this.botMessageRepo.findOne({
            where: {
                business_id: businessId,
                key_name: keyName,
                language: language as 'en' | 'si' | 'ta'
            },
        });

        if (!message) {
            throw new NotFoundException(`Bot message not found for key: ${keyName}, language: ${language}`);
        }

        return message;
    }

    // 8. Get available languages for bot messages
    async getBotMessageLanguages(businessId: number): Promise<string[]> {
        const messages = await this.botMessageRepo.find({
            where: { business_id: businessId },
            select: ['language'],
        });

        const uniqueLanguages = [...new Set(messages.map(m => m.language))];
        return uniqueLanguages.sort();
    }

    // 9. Get available message keys
    async getBotMessageKeys(businessId: number): Promise<string[]> {
        const messages = await this.botMessageRepo.find({
            where: { business_id: businessId },
            select: ['key_name'],
        });

        const uniqueKeys = [...new Set(messages.map(m => m.key_name))];
        return uniqueKeys.sort();
    }

    // 10. Search bot messages
    async searchBotMessages(
        businessId: number,
        searchTerm: string,
        language?: string,
        keyName?: string
    ): Promise<BotMessage[]> {
        const query = this.botMessageRepo.createQueryBuilder('message')
            .where('message.business_id = :businessId', { businessId })
            .andWhere('(message.key_name LIKE :search OR message.text LIKE :search)', {
                search: `%${searchTerm}%`
            });

        if (language) {
            query.andWhere('message.language = :language', { language });
        }

        if (keyName) {
            query.andWhere('message.key_name = :keyName', { keyName });
        }

        return query
            .orderBy('message.key_name', 'ASC')
            .addOrderBy('message.language', 'ASC')
            .getMany();
    }

    // 11. Reset bot messages for a business
    async resetBotMessages(businessId: number): Promise<BotMessage[]> {
        try {
            // 1. Read default messages from JSON file
            const filePath = join(__dirname, '../../data/bot_messages.json');
            const fileContent = readFileSync(filePath, 'utf-8');
            const jsonMessages = JSON.parse(fileContent) as Array<{
                language: 'en' | 'si' | 'ta';
                key_name: string;
                text: string;
            }>;

            if (!Array.isArray(jsonMessages) || jsonMessages.length === 0) {
                console.warn('No bot messages found in bot_messages.json');
                return [];
            }

            // 2. Optional: Delete existing messages for this business first
            await this.botMessageRepo.delete({ business_id: businessId });

            // 3. Insert default messages
            const newMessages: BotMessage[] = [];
            for (const item of jsonMessages) {
                const newRecord = this.botMessageRepo.create({
                    business_id: businessId,
                    language: item.language,
                    key_name: item.key_name,
                    text: item.text,
                });
                const saved = await this.botMessageRepo.save(newRecord);
                newMessages.push(saved);
            }

            return newMessages;
        } catch (error) {
            console.error('Failed to reset bot messages:', error);
            throw new NotFoundException('Failed to reset bot messages');
        }
    }


    // Helper method to get business ID from user email
    async getBusinessIdFromUser(email: string): Promise<number> {
        const business = await this.getBusinessByUser(email);
        return business.id;
    }
}
