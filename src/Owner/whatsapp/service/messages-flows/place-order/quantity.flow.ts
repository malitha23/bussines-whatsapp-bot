import { Repository } from "typeorm/repository/Repository";
import { BotMessage } from "../../../../../database/entities/bot-messages.entity";

// Parse input quantity
export function parseQuantity(input: string, unitFromVariant?: string) {
  const match = input.trim().toLowerCase().match(/([\d.]+)\s*(ml|l|g|kg|pcs|packets)?/);
  if (!match) return null;

  let qty = parseFloat(match[1]);
  let unit = match[2] || unitFromVariant;

  if (!unit) return { qty, unit: unitFromVariant, originalInput: input };

  switch (unit) {
    case 'l': return { qty: qty * 1000, unit: 'ml', originalInput: input };
    case 'kg': return { qty: qty * 1000, unit: 'g', originalInput: input };
    case 'ml': case 'g': case 'pcs': case 'packets': return { qty, unit, originalInput: input };
    default: return null;
  }
}

// Helper to fetch bot message
async function sendBotMessage(
  client: any,
  phone: string,
  botMessageRepo: Repository<BotMessage>,
  businessId: number,
  key: string,
  language: string,
  replacements?: Record<string, string | number>
) {
  const msgRecord = await botMessageRepo.findOne({ where: { business_id: businessId, key_name: key, language } });
  if (!msgRecord) return;

  let text = msgRecord.text;
  if (replacements) {
    for (const k in replacements) {
      text = text.replace(new RegExp(`{${k}}`, 'g'), replacements[k].toString());
    }
  }

  await client.sendMessage(phone, text);
}

// Main quantity input handler
export async function handleQuantityInput(
  client: any,
  phone: string,
  business: any,
  stateData: any,
  text: string,
  businessId: number,
  saveState: Function,
  productRepo: Repository<any>,
  botMessageRepo: Repository<BotMessage>,
  language: string
) {
  if (text === "0") {
    await saveState(businessId, phone, '', stateData, 'variant_selection');
    await sendBotMessage(client, phone, botMessageRepo, businessId, 'variant_file_back_to_variants', language);
    return;
  }

  const product = await productRepo.findOne({
    where: { id: stateData.productId },
    relations: ['variants'],
  });

  if (!product) {
    return sendBotMessage(client, phone, botMessageRepo, businessId, 'variant_file_product_not_found', language);
  }

  const variant = product.variants.find((v: { id: any }) => v.id === stateData.variantId);
  if (!variant) {
    return sendBotMessage(client, phone, botMessageRepo, businessId, 'variant_file_variant_not_found', language);
  }

  const parsed = parseQuantity(text, variant.unit);
  if (!parsed) {
    return sendBotMessage(client, phone, botMessageRepo, businessId, 'quantity_file_invalid_input', language);
  }

  let { qty, unit, originalInput } = parsed;

  // Convert stock to same unit as qty
  let stock = variant.stock;
  if (unit === 'g' && variant.unit === 'kg') stock = variant.stock * 1000;
  if (unit === 'ml' && variant.unit === 'l') stock = variant.stock * 1000;

  if (qty > stock) {
    return sendBotMessage(client, phone, botMessageRepo, businessId, 'quantity_file_not_enough_stock', language, { stock: variant.stock });
  }

  // Save quantity and prompt name
  stateData.quantity = qty;
  stateData.unit = unit;
  await saveState(businessId, phone, '', stateData, 'collect_customer_name');
  await sendBotMessage(client, phone, botMessageRepo, businessId, 'quantity_file_accepted', language, { input: originalInput });
}
