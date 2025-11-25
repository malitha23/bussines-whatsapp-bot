import { Client } from 'whatsapp-web.js';
import { Repository } from 'typeorm';
import { Order } from '../../../../../database/entities/order.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';


export async function startCancellationFlow(
  client: Client,
  phone: string,
  text: string,
  businessId: number,
  name: string,
  saveUserState: Function,
  orderRepo: Repository<Order>,
  botMessageRepo: Repository<BotMessage>,
  language: string
) {
  const orderId = parseInt(text);

  const order = await orderRepo.findOne({
    where: { id: orderId, customer: { phone }, business: { id: businessId } },
  });

  if (!order) {
    const invalidMsg = await getBotMessage(botMessageRepo, businessId, language, 'cancellation_invalid_order');
    await client.sendMessage(phone, invalidMsg);
    return;
  }

  await saveUserState(businessId, phone, name, { orderId }, 'awaiting_cancellation_reason');

  const confirmMsg = await getBotMessage(botMessageRepo, businessId, language, 'cancellation_confirm_prompt');
  await client.sendMessage(phone, confirmMsg);
}
