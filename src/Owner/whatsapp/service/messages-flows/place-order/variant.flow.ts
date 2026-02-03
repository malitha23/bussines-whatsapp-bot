import { Repository } from 'typeorm';

import { Product } from '../../../../../database/entities/product.entity';
import { Business } from '../../../../../database/entities/business.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';
import * as fs from 'fs';
import * as path from 'path';

export async function getProductWithVariants(
  productId: number,
  productRepo: Repository<Product>,
) {
  return await productRepo.findOne({
    where: { id: productId },
    relations: ['variants', 'variants.images'],
  });
}

export async function sendVariantsList(
  client: any,
  phone: string,
  business: any,
  productId: number,
  businessId: number,
  stateData: any,
  saveState: Function,
  productRepo: Repository<Product>,
  botMessageRepo: Repository<BotMessage>,
  language: string,
  sendManager: any,
) {
  const product = await getProductWithVariants(
    stateData.productId,
    productRepo,
  );

  if (!product || !product.variants?.length) {
    const msg = await getBotMessage(
      botMessageRepo,
      businessId,
      language,
      'no_variants',
    );
    await sendManager.sendMessage({ phone, text: msg });
    return;
  }

  let msg = `${await getBotMessage(botMessageRepo, businessId, language, 'select_variant_for')} ${product.name}\n\n`;
  product.variants.forEach(
    (v: { variant_name: any; price: any }, i: number) => {
      msg += `${i + 1}. ${v.variant_name} — Rs.${v.price}\n`;
    },
  );

  msg += `\n${await getBotMessage(botMessageRepo, businessId, language, 'enter_number_to_select')}`;
  msg += `\n${await getBotMessage(botMessageRepo, businessId, language, 'type_0_go_back')}`;

  await saveState(businessId, phone, '', stateData, 'variant_selection');
  await sendManager.sendMessage({ phone, text: msg });
}

// Handle variant selection
export async function handleVariantSelection(
  client: any,
  phone: string,
  business: Business,
  stateData: any,
  text: number,
  businessId: number,
  saveUserState: Function,
  botMessageRepo: Repository<BotMessage>,
  language: string,
  sendManager: any,
) {
  if (!stateData?.productId) {
    const msg = await getBotMessage(
      botMessageRepo,
      businessId,
      language,
      'product_not_found',
    );
    await sendManager.sendMessage({ phone, text: msg });
    return;
  }

  let product;
  if (stateData.subSubId === 0) {
    const subCategory = business.categories
      .flatMap((c) => c.subcategories ?? [])
      .find((s) => s.id === stateData.subCategoryId);
    product = subCategory?.products?.find((p) => p.id === stateData.productId);
  } else {
    product = business.categories
      .flatMap((c) => c.subcategories ?? [])
      .flatMap((s) => s.subsubcategories ?? [])
      .flatMap((ss) => ss.products ?? [])
      .find((p) => p.id === stateData.productId);
  }

  if (!product || !product.variants?.length) {
    const msg = await getBotMessage(
      botMessageRepo,
      businessId,
      language,
      'no_variants_for_product',
    );
    await sendManager.sendMessage({ phone, text: msg });
    return;
  }

  const activeVariants = product.variants.filter((v) => v.is_active);
  const index = text - 1;
  const variant = activeVariants[index];

  if (!variant) {
    const msg = await getBotMessage(
      botMessageRepo,
      businessId,
      language,
      'invalid_variant_selection',
    );
    await sendManager.sendMessage({ phone, text: msg });
    return;
  }

  stateData.variantId = variant.id;
  await saveUserState(businessId, phone, '', stateData, 'quantity_input');

  const mainImage = variant.images?.find((img) => img.is_main)?.image_url;
  const subImages =
    variant.images?.filter((img) => !img.is_main).map((img) => img.image_url) ||
    [];

  const caption = `🛍️ *${variant.variant_name}*\n💰 Price: Rs.${variant.price}\n📦 Stock: ${variant.stock} ${variant.unit}\n🆔 SKU: ${variant.sku || 'N/A'}`;
  // Send main image with caption if exists
  if (mainImage && (await fileExists(mainImage))) {
    try {
      const imageBuffer = fs.readFileSync(mainImage);

      await sendManager.sendMessageImage(
        phone,
        imageBuffer,
        caption,
        getMimeType(mainImage),
      );

      for (const imgPath of subImages) {
        if (await fileExists(imgPath)) {
          const subImageBuffer = fs.readFileSync(imgPath);

          await sendManager.sendMessageImage(
            phone,
            subImageBuffer,
            undefined,
            getMimeType(imgPath),
          );
        }
      }
    } catch (imageError) {
      console.error('Error sending variant images:', imageError);
      await sendManager.sendMessage({ phone, text: caption });
    }
  } else {
    await sendManager.sendMessage({ phone, text: caption });
  }

  const enterQuantityMsg = await getBotMessage(
    botMessageRepo,
    businessId,
    language,
    'enter_quantity',
  );
  const backMsg = await getBotMessage(
    botMessageRepo,
    businessId,
    language,
    'type_0_go_back',
  );

  await sendManager.sendMessage({
    phone,
    text: `${enterQuantityMsg} ${variant.unit}\n${backMsg}`,
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(filePath);
    return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
  } catch {
    return false;
  }
}

// Helper function to get MIME type
function getMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.svg': 'image/svg+xml',
  };

  return mimeTypes[extension] || 'image/jpeg';
}
