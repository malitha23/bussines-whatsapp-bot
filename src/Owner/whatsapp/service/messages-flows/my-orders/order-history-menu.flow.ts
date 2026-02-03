
import { Repository } from 'typeorm';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';
import { text } from 'stream/consumers';
 

export async function showOrderHistoryMenu(
  client: any,
  phone: string,
  language: string,
  businessId: number,
  botMessageRepo: Repository<BotMessage>,
  sendManager: any
) {
  const header = await getBotMessage(botMessageRepo, businessId, language, 'order_history_menu_header');
  const options = await getBotMessage(botMessageRepo, businessId, language, 'order_history_menu_options');
  const footer = await getBotMessage(botMessageRepo, businessId, language, 'order_history_menu_footer');

  const msg = `${header}\n\n${options}\n\n${footer}`;
  await sendManager.sendMessage({phone,text: msg });


}
