import { Repository } from 'typeorm';
import {
  DeliveryStatus,
  Order,
  OrderStatus,
} from '../../../../../database/entities/order.entity';
import { OrderCancellation } from '../../../../../database/entities/order-cancellation.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';

// Define constants for consistent checking
export const CANCELLABLE_ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'paid',
  'processing',
];
export const CANCELLABLE_DELIVERY_STATUSES: DeliveryStatus[] = [
  'pending',
  'confirmed',
  'processing',
];

export async function sendOrdersByStatus(
  client: any,
  phone: string,
  businessId: number,
  orderRepo: Repository<Order>,
  customerPhone: string,
  status: OrderStatus,
  saveUserState: Function,
  name: string,
  language: string,
  orderCancellationRepo: Repository<OrderCancellation>,
  botMessageRepo: Repository<BotMessage>,
  sendManager: any,
) {
  const orders = await orderRepo.find({
    where: {
      business: { id: businessId },
      customer: { phone: customerPhone },
      status,
    },
    relations: ['items', 'items.variant', 'items.variant.product'],
    order: { created_at: 'DESC' },
  });

  if (!orders.length) {
    const noneMsg = await getBotMessage(
      botMessageRepo,
      businessId,
      language,
      'orders_none',
    );
    await sendManager.sendMessage({
      phone,
      text: noneMsg.replace('{status}', status),
    });
    await saveUserState(
      businessId,
      phone,
      name,
      {},
      'order_history_menu',
      language,
    );
    return;
  }

  for (const order of orders) {
    let msg = `🆔 *Order #${order.id}*\n\n`;
    msg += `🕒 *Date:* ${new Date(order.created_at).toLocaleDateString()} ${new Date(order.created_at).toLocaleTimeString()}\n`;
    msg += `💳 *Payment:* ${order.payment_method.toUpperCase()} | ${order.payment_status.toUpperCase()}\n`;
    msg += `🚚 *Delivery:* ${order.delivery_status.toUpperCase()}\n\n`;

    msg += `🛍 *Items:*\n`;
    order.items.forEach((item) => {
      msg += `   • ${item.variant.product.name} - ${item.variant.variant_name}\n`;
      msg += `     Qty: ${item.quantity} ${item.variant.unit} x Rs.${item.price_per_unit}\n\n`;
    });

    msg += `📦 *Delivery Fee:* Rs.${order.delivery_fee}\n`;
    msg += `💰 *Total:* Rs.${order.total_amount}\n`;

    // Deposit pending check
    if (
      order.payment_method === 'deposit' &&
      order.payment_status === 'pending'
    ) {
      const depositMsg = await getBotMessage(
        botMessageRepo,
        businessId,
        language,
        'deposit_pending',
      );
      msg += `\n${depositMsg}\n`;

      const hasReceipt =
        order.payment_receipt_url && order.payment_receipt_url.trim() !== '';
      if (!hasReceipt) {
        const noReceiptMsg = await getBotMessage(
          botMessageRepo,
          businessId,
          language,
          'no_receipt_uploaded',
        );
        msg += `${noReceiptMsg}\n`;
      } else {
        const uploadedMsg = await getBotMessage(
          botMessageRepo,
          businessId,
          language,
          'receipt_already_uploaded',
        );
        msg += `${uploadedMsg}\n`;
      }
    }

    // Cancellation info
    const existingCancellation = await orderCancellationRepo.findOne({
      where: { order: { id: order.id } },
      order: { id: 'DESC' },
    });

    if (existingCancellation) {
      const cancelMsg = await getBotMessage(
        botMessageRepo,
        businessId,
        language,
        'cancellation_status',
      );
      msg += `\n${cancelMsg.replace('{status}', existingCancellation.status.toUpperCase())}\n`;
    } else if (
      CANCELLABLE_ORDER_STATUSES.includes(order.status) &&
      CANCELLABLE_DELIVERY_STATUSES.includes(order.delivery_status)
    ) {
      const cancelReqMsg = await getBotMessage(
        botMessageRepo,
        businessId,
        language,
        'cancellation_request_available',
      );
      msg += `\n${cancelReqMsg.replace('{orderId}', order.id.toString())}\n`;
    }

    msg += `\n🔹🔹🔹🔹🔹\n`;

    // Send this single order message
    await sendManager.sendMessage({ phone, text: msg });
  }

  // Back to menu after all orders
  const backMsg = await getBotMessage(
    botMessageRepo,
    businessId,
    language,
    'back_to_main_menu',
  );
  await sendManager.sendMessage({ phone, text: backMsg });

  if (status === 'paid' || status === 'confirmed') {
    await saveUserState(
      businessId,
      phone,
      name,
      {},
      'awaiting_order_cancellation',
      language,
    );
  } else {
    await saveUserState(
      businessId,
      phone,
      name,
      {},
      `${status}_orders`,
      language,
    );
  }
}
