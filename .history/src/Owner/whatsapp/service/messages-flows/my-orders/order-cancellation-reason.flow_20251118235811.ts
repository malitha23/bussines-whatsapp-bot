import { Client } from 'whatsapp-web.js';
import { Repository } from 'typeorm';
import { Order } from '../../../../../database/entities/order.entity';
import { OrderCancellation } from '../../../../../database/entities/order-cancellation.entity';

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
  language: string
) {
  // Fetch user state
  const userState = await userStateRepo.findOne({ where: { phone, business_id: businessId } });
  const stateData: any = userState?.last_message ? JSON.parse(userState.last_message) : {};

  if (!stateData.orderId) {
    await client.sendMessage(
      phone,
      '❌ Oops! Something went wrong. Please start again from the main menu.'
    );
    await saveUserState(businessId, phone, name, {}, 'main_menu', language, 'main_menu');

    return;
  }

  // Fetch the order
  const order = await orderRepo.findOne({
    where: { id: stateData.orderId, customer: { phone }, business: { id: businessId } },
  });
  if (!order) {
    await client.sendMessage(
      phone,
      '❌ We could not find your order. Please check your order ID or start again.'
    );
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
  await client.sendMessage(
    phone,
    `✅ Your cancellation request for Order #${order.id} has been successfully submitted!\n\n` +
    `Our team will review your request and notify you once it is processed.\n\n` +
    `➡️ Type *0* to go back to the main menu.`
  );

  // Reset user state to main menu
  await saveUserState(businessId, phone, name, {}, 'main_menu', language, 'main_menu');
}
