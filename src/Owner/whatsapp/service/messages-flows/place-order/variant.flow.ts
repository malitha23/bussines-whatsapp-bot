import { Repository } from "typeorm";
import { Client, MessageMedia } from "whatsapp-web.js";
import { Product } from "../../../../../database/entities/product.entity";
import { Business } from "../../../../../database/entities/business.entity";
import { BotMessage } from "../../../../../database/entities/bot-messages.entity";
import { getBotMessage } from "../../../helpers/getBotMessage";

export async function getProductWithVariants(
  productId: number,
  productRepo: Repository<Product>
) {
  return await productRepo.findOne({
    where: { id: productId },
    relations: ['variants', 'variants.images'],
  });
}

export async function sendVariantsList(
  client: Client,
  phone: string,
  business: any,
  productId: number,
  businessId: number,
  stateData: any,
  saveState: Function,
  productRepo: Repository<Product>,
  botMessageRepo: Repository<BotMessage>,
  language: string
) {
  const product = await getProductWithVariants(stateData.productId, productRepo);

  if (!product || !product.variants?.length) {
    const msg = await getBotMessage(botMessageRepo, businessId, language, 'no_variants');
    await client.sendMessage(phone, msg);
    return;
  }

  let msg = `${await getBotMessage(botMessageRepo, businessId, language, 'select_variant_for')} ${product.name}\n\n`;
  product.variants.forEach((v: { variant_name: any; price: any; }, i: number) => {
    msg += `${i + 1}. ${v.variant_name} — Rs.${v.price}\n`;
  });

  msg += `\n${await getBotMessage(botMessageRepo, businessId, language, 'enter_number_to_select')}`;
  msg += `\n${await getBotMessage(botMessageRepo, businessId, language, 'type_0_go_back')}`;

  await saveState(businessId, phone, '', stateData, 'variant_selection');
  await client.sendMessage(phone, msg);
}

// Handle variant selection
export async function handleVariantSelection(
  client: Client,
  phone: string,
  business: Business,
  stateData: any,
  text: number,
  businessId: number,
  saveUserState: Function,
  botMessageRepo: Repository<BotMessage>,
  language: string
) {
  if (!stateData?.productId) {
    const msg = await getBotMessage(botMessageRepo, businessId, language, 'product_not_found');
    await client.sendMessage(phone, msg);
    return;
  }

  let product;
  if (stateData.subSubId === 0) {
    const subCategory = business.categories
      .flatMap(c => c.subcategories ?? [])
      .find(s => s.id === stateData.subCategoryId);
    product = subCategory?.products?.find(p => p.id === stateData.productId);
  } else {
    product = business.categories
      .flatMap(c => c.subcategories ?? [])
      .flatMap(s => s.subsubcategories ?? [])
      .flatMap(ss => ss.products ?? [])
      .find(p => p.id === stateData.productId);
  }

  if (!product || !product.variants?.length) {
    const msg = await getBotMessage(botMessageRepo, businessId, language, 'no_variants_for_product');
    await client.sendMessage(phone, msg);
    return;
  }

  const activeVariants = product.variants.filter(v => v.is_active);
  const index = text - 1;
  const variant = activeVariants[index];

  if (!variant) {
    const msg = await getBotMessage(botMessageRepo, businessId, language, 'invalid_variant_selection');
    await client.sendMessage(phone, msg);
    return;
  }

  stateData.variantId = variant.id;
  await saveUserState(businessId, phone, '', stateData, 'quantity_input');

  const mainImage = variant.images?.find(img => img.is_main)?.image_url;
  const subImages = variant.images?.filter(img => !img.is_main).map(img => img.image_url) || [];

  const caption = `🛍️ *${variant.variant_name}*\n💰 Price: Rs.${variant.price}\n📦 Stock: ${variant.stock}${variant.unit}\n🆔 SKU: ${variant.sku || 'N/A'}`;
  if (mainImage) {
    try {
      await client.sendMessage(phone, MessageMedia.fromFilePath(`./${mainImage}`), { caption });
      for (const img of subImages) {
        await client.sendMessage(phone, MessageMedia.fromFilePath(`./${img}`));
      }
    } catch {
      await client.sendMessage(phone, caption);
    }
  } else {
    await client.sendMessage(phone, caption);
  }

  const enterQuantityMsg = await getBotMessage(botMessageRepo, businessId, language, 'enter_quantity');
  const backMsg = await getBotMessage(botMessageRepo, businessId, language, 'type_0_go_back');

  await client.sendMessage(
    phone,
    `${enterQuantityMsg} ${variant.unit}\n${backMsg}`
  );
}
