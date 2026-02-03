
import { In, Repository } from 'typeorm';
import { Order } from '../../../../../database/entities/order.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';
import { OrderCancellation } from '../../../../../database/entities/order-cancellation.entity';
import { CANCELLABLE_DELIVERY_STATUSES, CANCELLABLE_ORDER_STATUSES } from './list-orders.flow';


export async function startCancellationFlow(
  client: any,
  phone: string,
  text: string,
  businessId: number,
  name: string,
  saveUserState: Function,
  orderRepo: Repository<Order>,
  botMessageRepo: Repository<BotMessage>,
  language: string,
  orderCancellationRepo: Repository<OrderCancellation>,
  sendManager: any
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
      status: In(CANCELLABLE_ORDER_STATUSES),
      delivery_status: In(CANCELLABLE_DELIVERY_STATUSES),
    },
    relations: ['customer'],
  });

  if (!order || existingCancellation) {
    const invalidMsg = await getBotMessage(botMessageRepo, businessId, language, 'cancellation_invalid_order');
    await sendManager.sendMessage({phone, text: invalidMsg});
    return;
  }

  await saveUserState(businessId, phone, name, { orderId }, 'awaiting_cancellation_reason');

  const confirmMsg = await getBotMessage(botMessageRepo, businessId, language, 'cancellation_confirm_prompt');
  await sendManager.sendMessage({phone, text: confirmMsg});
}
