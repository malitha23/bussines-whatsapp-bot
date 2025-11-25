import { Client } from 'whatsapp-web.js';
import { Repository } from 'typeorm';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';


export async function showUploadReceiptMenu(
  client: Client,
  phone: string,
  language: string,
  businessId: number,
  botMessageRepo: Repository<BotMessage>
) {
  
  // Fetch each message using the helper
  const header = await getBotMessage(botMessageRepo, businessId, language, 'upload_receipt_menu_header');
  const option1 = await getBotMessage(botMessageRepo, businessId, language, 'upload_receipt_menu_option1');
  const option2 = await getBotMessage(botMessageRepo, businessId, language, 'upload_receipt_menu_option2');
  const goBack = await getBotMessage(botMessageRepo, businessId, language, 'upload_receipt_menu_go_back');

  // Construct message
  const fullMessage = `${header}\n\n1️⃣ ${option1}\n2️⃣ ${option2}\n\n${goBack}`;

  await client.sendMessage(phone, fullMessage);
}
