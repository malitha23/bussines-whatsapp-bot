import { Client } from "whatsapp-web.js";
import { Repository } from "typeorm";
import { format } from "date-fns";

// Helper to format quantity with units
function formatQuantity(quantity: number, unit?: string) {
  if (!unit) return quantity.toString();
  if (["kg", "g", "l", "ml"].includes(unit)) return quantity.toFixed(2); // show decimals for weight/volume
  return quantity.toString(); // pcs or other units
}

export async function createOrder(
  client: Client,
  phone: string,
  stateData: any,
  businessId: number,
  orderRepo: Repository<any>,
  itemRepo: Repository<any>
) {
  try {
    // Fetch order with customer & business
    const order = await orderRepo.findOne({
      where: { id: stateData.orderId },
      relations: ["customer", "business"],
    });

    if (!order) {
      await client.sendMessage(phone, "❌ Order not found.");
      return;
    }

    // Fetch order items
    const items = await itemRepo.find({
      where: { order: { id: order.id } },
      relations: ["variant", "variant.product"],
    });

    // Prepare items list and calculate total
    let total = 0;
    let itemsText = "";

    items.forEach((item, index) => {
      const productName = item.variant?.product?.name || "Product";
      const variantName = item.variant?.variant_name || "";
      const qty = item.quantity || 1;
      const unit = item.variant?.unit || "";
      const price = item.price_per_unit || 0;
      const lineTotal = item.total_price || price * qty;
      total += lineTotal;

      // Format quantity with unit
      const displayQty = formatQuantity(qty, unit);

      itemsText += `${index + 1}. ${productName}${variantName ? ` (${variantName})` : ""} - Qty: ${displayQty} ${unit}, Rs.${lineTotal.toFixed(2)}\n`;
    });

    const totalDisplay = total.toFixed(2);

    // Format order date
    const orderDate = format(new Date(order.created_at), "yyyy-MM-dd HH:mm");

    // Build message body
    const message = `
✅ Dear ${order.customer.name},

Your order *#${order.id}* has been confirmed.

📅 Date: ${orderDate}
🏢 Business: ${order.business.name}

📦 Order Details:
${itemsText}
💰 Total Amount: Rs.${totalDisplay}
💳 Payment Method: ${order.payment_method.toUpperCase()} (${order.payment_status})

🙏 Thank you for shopping with us!
`;

    // Ensure phone format for WhatsApp
    const formattedPhone = phone.includes("@c.us") ? phone : `${phone}@c.us`;

    // Send message
    await client.sendMessage(formattedPhone, message.trim());

  } catch (err) {
    console.error("❌ Error sending order text message:", err);
    await client.sendMessage(phone, "⚠️ Error sending order details. Please try again later.");
  }
}
