import { Client } from 'whatsapp-web.js';
import { Repository } from 'typeorm';
import { Order } from '../../../../../database/entities/order.entity';

export async function startCancellationFlow(
  client: Client,
  phone: string,
  text: string,
  businessId: number,
  name: string,
  saveUserState: Function,
  orderRepo: Repository<Order>
) {
  const orderId = parseInt(text);
  const order = await orderRepo.findOne({
    where: { id: orderId, customer: { phone }, business: { id: businessId } },
  });

  if (!order) {
    await client.sendMessage(phone, '❌ Invalid Order ID. Type again or 0 to go back.');
    return;
  }

  await saveUserState(businessId, phone, name, { orderId }, 'awaiting_cancellation_reason');
  await client.sendMessage(phone, '⚠️ Do you want to cancel this order? Type YES or NO.');
}
