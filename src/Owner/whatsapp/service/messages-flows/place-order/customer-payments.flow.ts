import { Client } from "whatsapp-web.js";
import { Repository } from "typeorm";
import { ProductVariant } from "../../../../../database/entities/product-variant.entity";
import { BusinessPaymentOption } from "../../../../../database/entities/business-payment-options.entity";
import { Order } from "../../../../../database/entities/order.entity";
import { OrderItem } from "../../../../../database/entities/order-item.entity";
import { BotMessage } from "../../../../../database/entities/bot-messages.entity";
import { BusinessDeliveryFee } from "../../../../../database/entities/business-delivery-fee.entity";

// Helper functions for unit conversion
function convertToBaseUnit(quantity: number, unit: string) {
  switch (unit.toLowerCase()) {
    case "kg": return quantity * 1000;
    case "g": return quantity;
    case "l": return quantity * 1000;
    case "ml": return quantity;
    case "pcs": return quantity;
    default: return quantity;
  }
}

function convertFromBaseUnit(quantityBase: number, unit: string) {
  switch (unit.toLowerCase()) {
    case "kg": return quantityBase / 1000;
    case "g": return quantityBase;
    case "l": return quantityBase / 1000;
    case "ml": return quantityBase;
    case "pcs": return quantityBase;
    default: return quantityBase;
  }
}

// Updated getBotMessage usage
async function getBotText(botMessageRepo: Repository<BotMessage>, businessId: number, language: string, key_name: string) {
  const msg = await botMessageRepo.findOne({
    where: { business_id: businessId, language, key_name },
  });
  return msg ? msg.text : "⚠ Message missing";
}

// Handle payment method selection
export async function handlePaymentMethod(
  client: Client,
  phone: string,
  text: string,
  stateData: any,
  businessId: number,
  language: string,
  saveState: Function,
  orderRepo: Repository<Order>,
  itemRepo: Repository<OrderItem>,
  variantRepo: Repository<ProductVariant>,
  businessPaymentOptionRepo: Repository<BusinessPaymentOption>,
  deliveryFeeRepo: Repository<BusinessDeliveryFee>,
  botMessageRepo: Repository<BotMessage>
) {
  const choice = text.trim();

  const options = await businessPaymentOptionRepo.find({
    where: { business: { id: businessId }, enabled: 1 },
    order: { id: "ASC" },
  });

  if (!options.length) {
    await client.sendMessage(phone, await getBotText(botMessageRepo, businessId, language, "customer_payment_no_options"));
    return;
  }

  const optionIndex = parseInt(choice) - 1;
  if (isNaN(optionIndex) || !options[optionIndex]) {
    await client.sendMessage(phone, await getBotText(botMessageRepo, businessId, language, "customer_payment_invalid_option"));
    return;
  }

  const selectedOption = options[optionIndex];
  stateData.paymentOption = selectedOption.key_name;
  stateData.payment_status = selectedOption.key_name.toLowerCase() === "card" ? "paid" : "pending";

  const variant = await variantRepo.findOne({ where: { id: stateData.variantId }, relations: ["product"] });
  if (!variant) {
    await client.sendMessage(phone, await getBotText(botMessageRepo, businessId, language, "customer_payment_invalid_option"));
    return;
  }

  const userQtyBase = convertToBaseUnit(stateData.quantity, stateData.unit);
  const variantUnitBase = convertToBaseUnit(1, variant.unit);
  const quantityInVariantUnit = userQtyBase / variantUnitBase;
  const pricePerUnit = variant.price;
  const totalPrice = pricePerUnit * quantityInVariantUnit;

  let unitType: "weight" | "volume" | "count" = "count";
  const unitLower = variant.unit.toLowerCase();
  if (unitLower === "kg" || unitLower === "g") unitType = "weight";
  else if (unitLower === "l" || unitLower === "ml") unitType = "volume";

  const deliveryFeeRecord = await deliveryFeeRepo
    .createQueryBuilder("fee")
    .where("fee.businessId = :businessId", { businessId })
    .andWhere("fee.unit_type = :unitType", { unitType })
    .andWhere("fee.min_value <= :qty", { qty: quantityInVariantUnit })
    .andWhere("fee.max_value >= :qty", { qty: quantityInVariantUnit })
    .getOne();

  const deliveryFee = deliveryFeeRecord ? Number(deliveryFeeRecord.fee) : 0;
  stateData.deliveryFee = deliveryFee;
  const finalTotal = Number(totalPrice) + deliveryFee;

  const order = orderRepo.create({
    business: { id: businessId },
    customer: stateData.customer,
    total_amount: finalTotal,
    delivery_fee: deliveryFee,
    payment_status: stateData.payment_status,
    delivery_status: "pending",
    status: stateData.payment_status === "paid" ? "paid" : "pending",
    payment_method: stateData.paymentOption,
  });
  const savedOrder = await orderRepo.save(order);

  const orderItem = itemRepo.create({
    order: savedOrder,
    variant,
    quantity: quantityInVariantUnit,
    price_per_unit: pricePerUnit,
    total_price: totalPrice,
  });
  await itemRepo.save(orderItem);

  if (stateData.payment_status === "paid") {
    await variantRepo.createQueryBuilder().update().set({ stock: () => `stock - ${quantityInVariantUnit}` }).where("id = :id", { id: variant.id }).execute();
  }

  const displayQty = convertFromBaseUnit(userQtyBase, variant.unit);
  let message = `
🧾 Invoice:
• Order ID: ${savedOrder.id}
• Product: ${variant.product.name}
• Variant: ${variant.variant_name}
• Quantity: ${displayQty} ${variant.unit}
• Price per unit: Rs. ${pricePerUnit}
• Subtotal: Rs. ${Number(totalPrice).toFixed(2)}
• Delivery Fee: Rs. ${deliveryFee.toFixed(2)}
• Total: Rs. ${finalTotal.toFixed(2)}
`;

  if (stateData.payment_status === "paid") {
    message = (await getBotText(botMessageRepo, businessId, language, "customer_payment_paid")) + "\n\n" + message;
    await saveState(businessId, phone, "", stateData, "post_payment");
  } else if (selectedOption.key_name.toLowerCase() === "cod") {
    message = (await getBotText(botMessageRepo, businessId, language, "customer_payment_cod")) + "\n\n" + message;
    await saveState(businessId, phone, "", stateData, "post_payment");
  } else {
    message = (await getBotText(botMessageRepo, businessId, language, "customer_payment_upload_receipt")) + "\n\n" + message;
    stateData.orderId = savedOrder.id;
    await saveState(businessId, phone, "", stateData, "upload_payment_receipt");
  }

  await client.sendMessage(phone.includes("@c.us") ? phone : `${phone}@c.us`, message);
}

// Handle payment receipt
export async function handlePaymentReceipt(
  client: Client,
  message: any,
  phone: string,
  stateData: any,
  businessId: number,
  language: string,
  saveState: Function,
  orderRepo: Repository<Order>,
  botMessageRepo: Repository<BotMessage>
) {
  if (!message?.hasMedia) {
    await client.sendMessage(phone, await getBotText(botMessageRepo, businessId, language, "customer_payment_receipt_missing"));
    return;
  }

  const media = await message.downloadMedia();
  const customerId = stateData.customer?.id || "unknown_customer";
  const orderId = stateData.orderId || "unknown_order";
  const receiptDir = `uploads/business_${businessId}/payments/${customerId}/${orderId}`;
  require("fs").mkdirSync(receiptDir, { recursive: true });

  const fileName = `${Date.now()}_${phone}.jpg`;
  const filePath = `${receiptDir}/${fileName}`;
  require("fs").writeFileSync(filePath, media.data, "base64");

  const fileUrl = `/uploads/business_${businessId}/payments/${customerId}/${orderId}/${fileName}`;

  if (stateData.orderId) {
    const order = await orderRepo.findOneBy({ id: stateData.orderId });
    if (order) {
      order.payment_receipt_url = fileUrl;
      order.payment_status = "pending";
      await orderRepo.save(order);
    }
  }

  stateData.receiptPath = fileUrl;
  stateData.payment_status = "pending";

  await client.sendMessage(phone, await getBotText(botMessageRepo, businessId, language, "customer_payment_receipt_uploaded"));
  await saveState(businessId, phone, "", stateData, "post_payment");
}
