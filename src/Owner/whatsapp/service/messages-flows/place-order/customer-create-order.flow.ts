import { Client } from "whatsapp-web.js";
import { Repository } from "typeorm";
import { format } from "date-fns";
import { BotMessage } from "../../../../../database/entities/bot-messages.entity";
import { getBotMessage } from "../../../helpers/getBotMessage";

// Helper to format quantity with units
function formatQuantity(quantity: number, unit?: string) {
  if (!unit) return quantity.toString();
  if (["kg", "g", "l", "ml"].includes(unit)) return quantity.toFixed(2);
  return quantity.toString();
}

export async function createOrder(
  client: Client,
  phone: string,
  stateData: any,
  businessId: number,
  language: string,
  orderRepo: Repository<any>,
  itemRepo: Repository<any>,
  botMessageRepo: Repository<BotMessage>
) {
  try {
    const order = await orderRepo.findOne({
      where: { id: stateData.orderId },
      relations: ["customer", "business"],
    });

    if (!order) {
      await client.sendMessage(phone, await getBotMessage(botMessageRepo, businessId, language, "order_not_found"));
      return;
    }

    const items = await itemRepo.find({
      where: { order: { id: order.id } },
      relations: ["variant", "variant.product"],
    });

    let total = 0;
    let itemsText = "";

    items.forEach(async (item, index) => {
      const productName = item.variant?.product?.name || await getBotMessage(botMessageRepo, businessId, language, "product_default_name");
      const variantName = item.variant?.variant_name || "";
      const qty = item.quantity || 1;
      const unit = item.variant?.unit || "";
      const price = item.price_per_unit || 0;
      const lineTotal = item.total_price || price * qty;
      total += lineTotal;

      const displayQty = formatQuantity(qty, unit);
      itemsText += `${index + 1}. ${productName}${variantName ? ` (${variantName})` : ""} - Qty: ${displayQty} ${unit}, Rs.${lineTotal.toFixed(2)}\n`;
    });

    const totalDisplay = total.toFixed(2);
    const orderDate = format(new Date(order.created_at), "yyyy-MM-dd HH:mm");

    // Build message with multilingual bot messages
    const greeting = await getBotMessage(botMessageRepo, businessId, language, "order_confirm_greeting");
    const dateLabel = await getBotMessage(botMessageRepo, businessId, language, "order_confirm_date");
    const businessLabel = await getBotMessage(botMessageRepo, businessId, language, "order_confirm_business");
    const orderDetailsLabel = await getBotMessage(botMessageRepo, businessId, language, "order_confirm_details");
    const totalLabel = await getBotMessage(botMessageRepo, businessId, language, "order_confirm_total");
    const paymentMethodLabel = await getBotMessage(botMessageRepo, businessId, language, "order_confirm_payment_method");
    const thankYou = await getBotMessage(botMessageRepo, businessId, language, "order_confirm_thank_you");

    const message = `
${greeting} ${order.customer.name},

${await getBotMessage(botMessageRepo, businessId, language, "order_confirm_order_number")} *#${order.id}*

${dateLabel}: ${orderDate}
${businessLabel}: ${order.business.name}

${orderDetailsLabel}:
${itemsText}
${totalLabel}: Rs.${totalDisplay}
${paymentMethodLabel}: ${order.payment_method.toUpperCase()} (${order.payment_status})

${thankYou}
`;

    const formattedPhone = phone.includes("@c.us") ? phone : `${phone}@c.us`;
    await client.sendMessage(formattedPhone, message.trim());

  } catch (err) {
    console.error("❌ Error sending order text message:", err);
    await client.sendMessage(phone, await getBotMessage(botMessageRepo, businessId, language, "order_confirm_error"));
  }
}
