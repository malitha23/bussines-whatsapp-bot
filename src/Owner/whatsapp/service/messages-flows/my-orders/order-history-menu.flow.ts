import { Client } from 'whatsapp-web.js';
import { Repository } from 'typeorm';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';


export async function showOrderHistoryMenu(
  client: Client,
  phone: string,
  language: string,
  businessId: number,
  botMessageRepo: Repository<BotMessage>
) {
  const header = await getBotMessage(botMessageRepo, businessId, language, 'order_history_menu_header');
  const options = await getBotMessage(botMessageRepo, businessId, language, 'order_history_menu_options');
  const footer = await getBotMessage(botMessageRepo, businessId, language, 'order_history_menu_footer');

  const msg = `${header}\n\n${options}\n\n${footer}`;
  await client.sendMessage(phone, msg);
}
