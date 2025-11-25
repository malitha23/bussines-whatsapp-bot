import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../../../../../database/entities/order.entity';
import { OrderCancellation } from '../../../../../database/entities/order-cancellation.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { Client } from 'whatsapp-web.js';
import { getBotMessage } from '../../../helpers/getBotMessage';

export async function sendOrdersByStatus(
  client: Client,
  phone: string,
  businessId: number,
  orderRepo: Repository<Order>,
  customerPhone: string,
  status: OrderStatus,
  saveUserState: Function,
  name: string,
  language: string,
  orderCancellationRepo: Repository<OrderCancellation>,
  botMessageRepo: Repository<BotMessage>
) {
  const orders = await orderRepo.find({
    where: { business: { id: businessId }, customer: { phone: customerPhone }, status },
    relations: ['items', 'items.variant', 'items.variant.product'],
    order: { created_at: 'DESC' },
  });

  if (!orders.length) {
    const noneMsg = await getBotMessage(botMessageRepo, businessId, language, 'orders_none');
    await client.sendMessage(phone, noneMsg.replace('{status}', status));
    await saveUserState(businessId, phone, name, {}, 'order_history_menu', language);
    return;
  }

  let header = await getBotMessage(botMessageRepo, businessId, language, 'orders_header');
  let msg = `${header.replace('{status}', status.toUpperCase())}\n\n`;

  for (const order of orders) {
    msg += `🆔 *Order #${order.id}*\n`;
    msg += `🕒 *Date:* ${new Date(order.created_at).toLocaleDateString()} ${new Date(order.created_at).toLocaleTimeString()}\n`;
    msg += `💰 *Total:* Rs.${order.total_amount}   💳 *Payment:* ${order.payment_method.toUpperCase()} | ${order.payment_status.toUpperCase()}\n`;
    msg += `📦 *Delivery Fee:* Rs.${order.delivery_fee}\n`;
    msg += `🚚 *Delivery:* ${order.delivery_status.toUpperCase()}\n\n`;

    msg += `🛍 *Items:*\n`;
    order.items.forEach(item => {
      msg += `   • ${item.variant.product.name} - ${item.variant.variant_name}\n`;
      msg += `     Qty: ${item.quantity} ${item.variant.unit} x Rs.${item.price_per_unit}\n`;
    });

    if (order.payment_method === 'deposit' && order.payment_status === 'pending') {
      const depositMsg = await getBotMessage(botMessageRepo, businessId, language, 'deposit_pending');
      msg += `\n${depositMsg}\n`;

      const hasReceipt =
        order.payment_receipt_url && order.payment_receipt_url.trim() !== '' && order.payment_receipt_url !== null;

      if (!hasReceipt) {
        const noReceiptMsg = await getBotMessage(botMessageRepo, businessId, language, 'no_receipt_uploaded');
        msg += `${noReceiptMsg}\n`;
      } else {
        const uploadedMsg = await getBotMessage(botMessageRepo, businessId, language, 'receipt_already_uploaded');
        msg += `${uploadedMsg}\n`;
      }
    }

    const existingCancellation = await orderCancellationRepo.findOne({
      where: { order: { id: order.id } },
      order: { id: 'DESC' },
    });

    if (existingCancellation) {
      const cancelMsg = await getBotMessage(botMessageRepo, businessId, language, 'cancellation_status');
      msg += `\n${cancelMsg.replace('{status}', existingCancellation.status.toUpperCase())}\n`;
    } else if (['paid', 'confirmed'].includes(order.status) && order.delivery_status === 'pending') {
      const cancelReqMsg = await getBotMessage(botMessageRepo, businessId, language, 'cancellation_request_available');
      msg += `\n${cancelReqMsg.replace('{orderId}', order.id.toString())}\n`;
    }

    msg += `\n🔹🔹🔹🔹🔹\n\n`;
  }

  const backMsg = await getBotMessage(botMessageRepo, businessId, language, 'back_to_main_menu');
  msg += `${backMsg}`;

  await client.sendMessage(phone, msg);

  if (status === 'paid' || status === 'confirmed') {
    await saveUserState(businessId, phone, name, {}, 'awaiting_order_cancellation', language);
    return;
  }

  await saveUserState(businessId, phone, name, {}, `${status}_orders`, language);
}
