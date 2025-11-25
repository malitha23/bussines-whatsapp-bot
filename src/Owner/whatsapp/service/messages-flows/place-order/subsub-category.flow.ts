// src/whatsapp/flows/place-order/subsub-category.flow.ts

import { Client, MessageMedia } from 'whatsapp-web.js';
import { Business } from '../../../../../database/entities/business.entity';
import { Repository } from 'typeorm';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';


/* -------------------------------------------------------
   SELECT SUB-SUB CATEGORY
------------------------------------------------------- */
export async function selectSubSubCategory(
  client: Client,
  phone: string,
  business: Business,
  subCategoryId: number,
  language: string,
  botMessageRepo: Repository<BotMessage>
) {
  if (!business?.categories) {
    const txt = await getBotMessage(botMessageRepo, business.id, language, 'subsub_invalid');
    await client.sendMessage(phone, txt);
    return { nextState: "category_selection" };
  }

  const subcategory = business.categories
    .flatMap(c => c.subcategories ?? [])
    .find(sc => sc.id === subCategoryId);

  if (!subcategory) {
    const txt = await getBotMessage(botMessageRepo, business.id, language, 'subsub_no_subcategory');
    await client.sendMessage(phone, txt);
    return { nextState: "category_selection" };
  }

  const subsubs = subcategory.subsubcategories || [];
  const directProducts = (subcategory.products || []).filter(
    p => !p.subsubCategory && p.is_active
  );

  const selectMsg = await getBotMessage(botMessageRepo, business.id, language, 'subsub_select');
  const directMsg = await getBotMessage(botMessageRepo, business.id, language, 'subsub_direct_products');
  const backMsg = await getBotMessage(botMessageRepo, business.id, language, 'subsub_back');

  let msg = `${selectMsg}\n\n`;

  if (directProducts.length > 0) {
    msg += `${directMsg}\n\n`;
  }

  subsubs.forEach((s, idx) => {
    msg += `${idx + 1}️⃣ ${s.name}\n`;
  });

  if (subsubs.length === 0 && directProducts.length === 0) {
    const noneMsg = await getBotMessage(botMessageRepo, business.id, language, 'subsub_none');
    await client.sendMessage(phone, noneMsg);
    return { nextState: "subcategory_selection" };
  }

  msg += `\n${backMsg}`;

  await client.sendMessage(phone, msg);

  return { nextState: "subsub_category_selection" };
}

/* -------------------------------------------------------
   SEND PRODUCT LIST
------------------------------------------------------- */
export async function sendProductsList(
  client: Client,
  phone: string,
  business: Business,
  subSubId: number | null,
  subCategoryId: number | undefined,
  language: string,
  botMessageRepo: Repository<BotMessage>
) {
  const categories = business?.categories ?? [];
  let products: any[] = [];

  if (subSubId === 0) {
    const subCategory = categories
      .flatMap(c => c.subcategories ?? [])
      .find(s => s.id === subCategoryId);

    if (!subCategory) {
      const txt = await getBotMessage(botMessageRepo, business.id, language, 'subsub_no_subcategory');
      await client.sendMessage(phone, txt);
      return false;
    }

    products = (subCategory.products || []).filter(
      p => p.is_active && (!p.subsubCategory || p.subsubCategory === null)
    );

  } else if (subSubId !== null) {
    const subSub = categories
      .flatMap(c => c.subcategories ?? [])
      .flatMap(s => s.subsubcategories ?? [])
      .find(ss => ss.id === subSubId);

    if (!subSub) {
      const txt = await getBotMessage(botMessageRepo, business.id, language, 'subsub_no_subsub');
      await client.sendMessage(phone, txt);
      return false;
    }

    products = (subSub.products || []).filter(p => p.is_active);
  }

  if (products.length === 0) {
    const txt = await getBotMessage(botMessageRepo, business.id, language, 'subsub_none');
    await client.sendMessage(phone, txt);
    return false;
  }

  const header = await getBotMessage(botMessageRepo, business.id, language, 'product_list_header');
  const selectTxt = await getBotMessage(botMessageRepo, business.id, language, 'product_select_number');
  const backToMenu = await getBotMessage(botMessageRepo, business.id, language, 'type_0_go_back');

  const productList = products
    .map((p, i) => `${i + 1}. ${p.name} — Rs.${p.base_price}`)
    .join('\n');

  await client.sendMessage(
    phone,
    `${header}\n\n${productList}\n\n${selectTxt}\n${backToMenu}`
  );

  return true;
}

/* -------------------------------------------------------
   SEND INDIVIDUAL PRODUCTS WITH IMAGES
------------------------------------------------------- */
export async function sendProducts(
  client: Client,
  phone: string,
  products: any[],
  language?: string,
  business?: Business,
  botMessageRepo?: Repository<BotMessage>
) {
  if (!products.length) {
    await client.sendMessage(phone, '❌ No products available 😅');
    return;
  }

  let backToMenu = "➡️ Type 0 to return to main menu.";

  if (language && business && botMessageRepo) {
    backToMenu = await getBotMessage(botMessageRepo, business.id, language, 'type_0_go_back');
  }

  for (const p of products) {
    const mainImage = p.images?.find((img: any) => img.is_main)?.image_url;
    const subImages = p.images?.filter((img: any) => !img.is_main).map((img: any) => img.image_url) || [];
    const totalStock = Array.isArray(p.variants)
      ? p.variants.reduce((sum: any, v: any) => sum + (v.stock ?? 0), 0)
      : 0;

    const variantsText = p.variants?.length
      ? p.variants.map((v: any) => `• ${v.variant_name} - Rs.${v.price} (${v.stock} left)`).join('\n')
      : 'No variants available.';

    const caption =
      `📦 *${p.name}*\n` +
      `💰 *Base Price:* Rs.${p.base_price}\n` +
      `📦 *Stock:* ${totalStock} units\n` +
      `${variantsText}\n\n` +
      `${backToMenu}`;

    if (mainImage) {
      try {
        const file = MessageMedia.fromFilePath(`./${mainImage}`);
        await client.sendMessage(phone, file, { caption });

        for (const img of subImages) {
          const subFile = MessageMedia.fromFilePath(`./${img}`);
          await client.sendMessage(phone, subFile);
        }
      } catch {
        await client.sendMessage(phone, caption);
      }
    } else {
      await client.sendMessage(phone, caption);
    }
  }

  const endMsg = await getBotMessage(botMessageRepo!, business!.id, language!, 'all_products_end');
  await client.sendMessage(
    phone,
    endMsg || "✅ These are all products! Type 0 for main menu."
  );
}
