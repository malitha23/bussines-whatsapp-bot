import { Client } from 'whatsapp-web.js';
import { In, Repository } from 'typeorm';
import { Order } from '../../../../../database/entities/order.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';
import { OrderCancellation } from '../../../../../database/entities/order-cancellation.entity';


export async function startCancellationFlow(
  client: Client,
  phone: string,
  text: string,
  businessId: number,
  name: string,
  saveUserState: Function,
  orderRepo: Repository<Order>,
  botMessageRepo: Repository<BotMessage>,
  language: string,
  orderCancellationRepo: Repository<OrderCancellation>
) {
  const orderId = parseInt(text);

  const existingCancellation = await orderCancellationRepo.findOne({
      where: { order: { id: orderId } },
      order: { id: 'DESC' },
    });

const order = await orderRepo.findOne({
  where: {
    id: orderId,
    customer: { phone },
    business: { id: businessId },
    status: In(['paid', 'confirmed']),   
    delivery_status: 'pending',         
  },
  relations: ['customer'],  // include relations if needed
});

  if (!order || existingCancellation) {
    const invalidMsg = await getBotMessage(botMessageRepo, businessId, language, 'cancellation_invalid_order');
    await client.sendMessage(phone, invalidMsg);
    return;
  }

  await saveUserState(businessId, phone, name, { orderId }, 'awaiting_cancellation_reason');

  const confirmMsg = await getBotMessage(botMessageRepo, businessId, language, 'cancellation_confirm_prompt');
  await client.sendMessage(phone, confirmMsg);
}
