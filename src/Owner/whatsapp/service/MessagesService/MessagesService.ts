import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { BotMessage } from '../../../../database/entities/bot-messages.entity';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(BotMessage)
    private readonly botMessageRepo: Repository<BotMessage>
  ) {}

  // Get message for a business and language
  async getMessage(businessId: number, key: string, lang: string = 'si', params?: Record<string, any>): Promise<string> {
    const msgRecord = await this.botMessageRepo.findOne({ where: { business_id: businessId, key_name: key, language: lang } });
    let text = msgRecord?.text || key;

    if (params) {
      for (const k in params) {
        text = text.replace(`{${k}}`, String(params[k]));
      }
    }

    return text;
  }
}
