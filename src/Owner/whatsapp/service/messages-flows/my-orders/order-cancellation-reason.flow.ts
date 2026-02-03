import { Repository } from 'typeorm';
import {
  Order,
  OrderStatus,
} from '../../../../../database/entities/order.entity';
import { OrderCancellation } from '../../../../../database/entities/order-cancellation.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';

export async function enterCancellationReason(
  client: any,
  phone: string,
  text: string,
  businessId: number,
  name: string,
  saveUserState: Function,
  userStateRepo: Repository<any>, // UserState
  orderRepo: Repository<Order>,
  orderCancellationRepo: Repository<OrderCancellation>,
  botMessageRepo: Repository<BotMessage>,
  language: string,
  quickStatsGateway: any,
  sendManager: any,
) {
  // Fetch user state
  const userState = await userStateRepo.findOne({
    where: { phone, business_id: businessId },
  });
  const stateData: any = userState?.last_message
    ? JSON.parse(userState.last_message)
    : {};

  if (!stateData.orderId) {
    const msg = await getBotMessage(
      botMessageRepo,
      businessId,
      language,
      'cancellation_reason_error_no_order',
    );
    await sendManager.sendMessage({ phone, text: msg });
    await saveUserState(
      businessId,
      phone,
      name,
      {},
      'main_menu',
      language,
      'main_menu',
    );
    return;
  }

  // Fetch the order
  const order = await orderRepo.findOne({
    where: {
      id: stateData.orderId,
      customer: { phone },
      business: { id: businessId },
    },
  });

  if (!order) {
    const msg = await getBotMessage(
      botMessageRepo,
      businessId,
      language,
      'cancellation_reason_order_not_found',
    );
    await sendManager.sendMessage({ phone, text: msg });
    await saveUserState(
      businessId,
      phone,
      name,
      {},
      'main_menu',
      language,
      'main_menu',
    );
    return;
  }

  // Save cancellation request
  const cancellation = orderCancellationRepo.create({
    order,
    reason: text,
    status: 'pending',
  });
  await orderCancellationRepo.save(cancellation);
  order.status = 'return_requested' as OrderStatus;
  await orderRepo.save(order);

  await quickStatsGateway.broadcastStats(businessId);

  // Friendly confirmation message
  let successMsg = await getBotMessage(
    botMessageRepo,
    businessId,
    language,
    'cancellation_reason_success',
  );
  successMsg = successMsg.replace('#{orderId}', order.id.toString());
  await sendManager.sendMessage({ phone, text: successMsg });

  // Reset user state to main menu
  await saveUserState(
    businessId,
    phone,
    name,
    {},
    'main_menu',
    language,
    'main_menu',
  );
}
