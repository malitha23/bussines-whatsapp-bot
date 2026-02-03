// src/whatsapp/flows/place-order/subsub-category.flow.ts

import { Business } from '../../../../../database/entities/business.entity';
import { Repository } from 'typeorm';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';
import * as fs from 'fs';
import * as path from 'path';

/* -------------------------------------------------------
   SELECT SUB-SUB CATEGORY
------------------------------------------------------- */
export async function selectSubSubCategory(
  client: any,
  phone: string,
  business: Business,
  subCategoryId: number,
  language: string,
  botMessageRepo: Repository<BotMessage>,
  sendManager: any,
) {
  console.log(
    `DEBUG selectSubSubCategory: business.id=${business?.id}, subCategoryId=${subCategoryId}`,
  );
  console.log(`DEBUG: business.categories=`, business?.categories);

  if (!business?.categories) {
    console.log(`ERROR: business.categories is undefined or empty!`);
    const txt = await getBotMessage(
      botMessageRepo,
      business.id,
      language,
      'subsub_invalid',
    );
    await sendManager.sendMessage({
      phone,
      text: txt,
    });

    return { nextState: 'category_selection' };
  }
  const subcategory = business.categories
    .flatMap((c) => c.subcategories ?? [])
    .find((sc) => sc.id === subCategoryId);

  if (!subcategory) {
    const txt = await getBotMessage(
      botMessageRepo,
      business.id,
      language,
      'subsub_no_subcategory',
    );
    await sendManager.sendMessage({
      phone,
      text: txt,
    });

    return { nextState: 'category_selection' };
  }

  const subsubs = subcategory.subsubcategories || [];
  const directProducts = (subcategory.products || []).filter(
    (p) => !p.subsubCategory && p.is_active,
  );

  const selectMsg = await getBotMessage(
    botMessageRepo,
    business.id,
    language,
    'subsub_select',
  );
  const directMsg = await getBotMessage(
    botMessageRepo,
    business.id,
    language,
    'subsub_direct_products',
  );
  const backMsg = await getBotMessage(
    botMessageRepo,
    business.id,
    language,
    'subsub_back',
  );

  let msg = `${selectMsg}\n\n`;

  if (directProducts.length > 0) {
    msg += `${directMsg}\n`;
  }

  subsubs.forEach((s, idx) => {
    msg += `${idx + 1}️⃣ ${s.name}\n`;
  });

  if (subsubs.length === 0 && directProducts.length === 0) {
    const noneMsg = await getBotMessage(
      botMessageRepo,
      business.id,
      language,
      'subsub_none',
    );
    await sendManager.sendMessage({
      phone,
      text: noneMsg,
    });

    return { nextState: 'subcategory_selection' };
  }

  msg += `\n${backMsg}`;

  await sendManager.sendMessage({
    phone,
    text: msg,
  });

  return { nextState: 'subsub_category_selection' };
}

/* -------------------------------------------------------
   SEND PRODUCT LIST
------------------------------------------------------- */
export async function sendProductsList(
  client: any,
  phone: string,
  business: Business,
  subSubId: number | null,
  subCategoryId: number | undefined,
  language: string,
  botMessageRepo: Repository<BotMessage>,
  sendManager: any,
) {
  const categories = business?.categories ?? [];
  let products: any[] = [];

  if (subSubId === 0) {
    const subCategory = categories
      .flatMap((c) => c.subcategories ?? [])
      .find((s) => s.id === subCategoryId);

    if (!subCategory) {
      const txt = await getBotMessage(
        botMessageRepo,
        business.id,
        language,
        'subsub_no_subcategory',
      );
      await sendManager.sendMessage({
        phone,
        text: txt,
      });
      return false;
    }

    products = (subCategory.products || []).filter(
      (p) => p.is_active && (!p.subsubCategory || p.subsubCategory === null),
    );
  } else if (subSubId !== null) {
    const subSub = categories
      .flatMap((c) => c.subcategories ?? [])
      .flatMap((s) => s.subsubcategories ?? [])
      .find((ss) => ss.id === subSubId);

    if (!subSub) {
      const txt = await getBotMessage(
        botMessageRepo,
        business.id,
        language,
        'subsub_no_subsub',
      );
      await sendManager.sendMessage({
        phone,
        text: txt,
      });
      return false;
    }

    products = (subSub.products || []).filter((p) => p.is_active);
  }

  if (products.length === 0) {
    const txt = await getBotMessage(
      botMessageRepo,
      business.id,
      language,
      'subsub_none',
    );
    await sendManager.sendMessage({
      phone,
      text: txt,
    });
    return false;
  }

  const header = await getBotMessage(
    botMessageRepo,
    business.id,
    language,
    'product_list_header',
  );
  const selectTxt = await getBotMessage(
    botMessageRepo,
    business.id,
    language,
    'product_select_number',
  );
  const backToMenu = await getBotMessage(
    botMessageRepo,
    business.id,
    language,
    'type_0_go_back',
  );

  const productList = products
    .map((p, i) => `${i + 1}. ${p.name} — Rs.${p.base_price}`)
    .join('\n');

  await sendManager.sendMessage({
    phone,
    text: `${header}\n\n${productList}\n\n${selectTxt}\n${backToMenu}`,
  });

  return true;
}

/* -------------------------------------------------------
   SEND INDIVIDUAL PRODUCTS WITH IMAGES
------------------------------------------------------- */

// export async function sendProducts(
//   client: any,
//   phone: string,
//   products: any[],
//   language?: string,
//   business?: any,
//   botMessageRepo?: any,
//   sendManager: any
// ) {
//   if (!products.length) {
//     await sendManager.sendMessage({phone, text: '❌ No products available 😅' });
//     return;
//   }

//   let backToMenu = "➡️ Type 0 to return to main menu.";

//   if (language && business && botMessageRepo) {
//     try {
//       const message = await getBotMessage(botMessageRepo, business.id, language, 'type_0_go_back');
//       if (message) backToMenu = message;
//     } catch (error) {
//       console.warn('Could not fetch bot message:', error);
//     }
//   }

//   for (const p of products) {
//     try {
//       const mainImage = p.images?.find((img: any) => img.is_main)?.image_url;
//       const subImages = p.images
//         ?.filter((img: any) => !img.is_main)
//         .map((img: any) => img.image_url) || [];

//       const totalStock = Array.isArray(p.variants)
//         ? p.variants.reduce((sum: any, v: any) => sum + (v.stock ?? 0), 0)
//         : 0;

//       const variantsText = p.variants?.length
//         ? p.variants.map((v: any) => `• ${v.variant_name} - Rs.${v.price} (${v.stock} left)`).join('\n')
//         : 'No variants available.';

//       const caption =
//         `📦 *${p.name}*\n` +
//         `💰 *Base Price:* Rs.${p.base_price}\n` +
//         `📦 *Stock:* ${totalStock} units\n` +
//         `${variantsText}\n\n` +
//         `${backToMenu}`;

//       // Check if main image exists and is accessible
//       if (mainImage && await fileExists(mainImage)) {
//         try {
//           // Read the image file
//           const imageBuffer = fs.readFileSync(mainImage);

//           // Send main image with caption
//           await sendManager.sendMessage({phone,
//             image: imageBuffer,
//             caption: caption,
//             mimetype: getMimeType(mainImage)
//           });

//           // Send sub images
//           for (const imgPath of subImages) {
//             if (await fileExists(imgPath)) {
//               const subImageBuffer = fs.readFileSync(imgPath);
//               await sendManager.sendMessage({phone,
//                 image: subImageBuffer,
//                 mimetype: getMimeType(imgPath)
//               });
//             }
//           }
//         } catch (imageError) {
//           console.error(`Error sending image for product ${p.name}:`, imageError);
//           // Fallback to text only
//           await sendManager.sendMessage({phone, text: caption });
//         }
//       } else {
//         // Send text only if no image
//         await sendManager.sendMessage({phone, text: caption });
//       }

//       // Small delay between products to avoid rate limiting
//       await sleep(1000);

//     } catch (error) {
//       console.error(`Error sending product ${p.name}:`, error);
//       // Continue with next product even if one fails
//     }
//   }

//   try {
//     const endMsg = business && botMessageRepo && language
//       ? await getBotMessage(botMessageRepo, business.id, language, 'all_products_end')
//       : "✅ These are all products! Type 0 for main menu.";

//     await sendManager.sendMessage({phone, text: endMsg });
//   } catch (error) {
//     console.error('Error sending end message:', error);
//     await sendManager.sendMessage({phone, text: "✅ These are all products! Type 0 for main menu." });
//   }
// }

// Helper function to check if file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    // Check if path is absolute or relative
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(filePath);
    return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
  } catch {
    return false;
  }
}

// Helper function to get MIME type from file extension
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

// Helper function for delay
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
