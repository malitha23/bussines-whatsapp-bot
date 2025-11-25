import { Client } from 'whatsapp-web.js';
import { Repository } from 'typeorm';
import { Order } from '../../../../../database/entities/order.entity';
import { OrderCancellation } from '../../../../../database/entities/order-cancellation.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';


export async function enterCancellationReason(
  client: Client,
  phone: string,
  text: string,
  businessId: number,
  name: string,
  saveUserState: Function,
  userStateRepo: Repository<any>, // UserState
  orderRepo: Repository<Order>,
  orderCancellationRepo: Repository<OrderCancellation>,
  botMessageRepo: Repository<BotMessage>,
  language: string
) {
  // Fetch user state
  const userState = await userStateRepo.findOne({ where: { phone, business_id: businessId } });
  const stateData: any = userState?.last_message ? JSON.parse(userState.last_message) : {};

  if (!stateData.orderId) {
    const msg = await getBotMessage(botMessageRepo, businessId, language, 'cancellation_reason_error_no_order');
    await client.sendMessage(phone, msg);
    await saveUserState(businessId, phone, name, {}, 'main_menu', language, 'main_menu');
    return;
  }

  // Fetch the order
  const order = await orderRepo.findOne({
    where: { id: stateData.orderId, customer: { phone }, business: { id: businessId } },
  });

  if (!order) {
    const msg = await getBotMessage(botMessageRepo, businessId, language, 'cancellation_reason_order_not_found');
    await client.sendMessage(phone, msg);
    await saveUserState(businessId, phone, name, {}, 'main_menu', language, 'main_menu');
    return;
  }

  // Save cancellation request
  const cancellation = orderCancellationRepo.create({
    order,
    reason: text,
    status: 'pending',
  });
  await orderCancellationRepo.save(cancellation);

  // Friendly confirmation message
  let successMsg = await getBotMessage(botMessageRepo, businessId, language, 'cancellation_reason_success');
  successMsg = successMsg.replace('#{orderId}', order.id.toString());
  await client.sendMessage(phone, successMsg);

  // Reset user state to main menu
  await saveUserState(businessId, phone, name, {}, 'main_menu', language, 'main_menu');
}
