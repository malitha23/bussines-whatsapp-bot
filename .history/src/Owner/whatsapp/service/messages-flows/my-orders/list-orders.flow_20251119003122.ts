import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../../../../../database/entities/order.entity';
import { OrderCancellation } from '../../../../../database/entities/order-cancellation.entity';

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
  orderCancellationRepo: Repository<OrderCancellation>, // Added repo for cancellations
) {
  const orders = await orderRepo.find({
    where: {
      business: { id: businessId },
      customer: { phone: customerPhone },
      status: status,
    },
    relations: [
      'items',
      'items.variant',
      'items.variant.product'
    ],
    order: { created_at: 'DESC' },
  });

  if (!orders.length) {
    await client.sendMessage(phone, `❗ No ${status} orders found.`);
    await saveUserState(businessId, phone, name, {}, 'order_history_menu', language);
    return;
  }

  let msg = `📦 *Your ${status.toUpperCase()} Orders*\n\n`;

  for (const order of orders) {
    msg += `🆔 *Order #${order.id}*\n`;
    msg += `🕒 *Date:* ${new Date(order.created_at).toLocaleDateString()} ${new Date(order.created_at).toLocaleTimeString()}\n`;
    msg += `💰 *Total:* Rs.${order.total_amount}   💳 *Payment:* ${order.payment_method.toUpperCase()} | ${order.payment_status.toUpperCase()}\n`;
    msg += `🚚 *Delivery:* ${order.delivery_status.toUpperCase()}\n\n`;

    msg += `🛍 *Items:*\n`;
    order.items.forEach(item => {
      msg += `   • ${item.variant.product.name} - ${item.variant.variant_name}\n`;
      msg += `     Qty: ${item.quantity} ${item.variant.unit} x Rs.${item.price_per_unit}\n`;
    });

    const existingCancellation = await orderCancellationRepo.findOne({
      where: { order: { id: order.id } },
      order: { id: 'DESC' },
    });

    if (existingCancellation) {
      msg += `\n⚠️ *Cancellation Status:* ${existingCancellation.status.toUpperCase()}\n`;
    } else if (['paid', 'confirmed'].includes(order.status) && order.delivery_status === 'pending') {
      msg += `\n⚠️ You can request cancellation for this order.\n`;
      msg += `➡️ Type *${order.id}* to start cancellation.\n`;
    }

    msg += `\n🔹🔹🔹🔹🔹\n\n`; // clean, spaced separator
  }

  msg += `0️⃣ *Back to Main Menu*`;

  await client.sendMessage(phone, msg);


  // Set user state for cancellation only if eligible
  if (status === 'paid' || status === 'confirmed') {
    await saveUserState(businessId, phone, name, {}, 'awaiting_order_cancellation', language);
    return;
  }

  await saveUserState(businessId, phone, name, {}, `${status}_orders`, language);
}
