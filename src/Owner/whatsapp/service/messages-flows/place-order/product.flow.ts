import { Client, MessageMedia } from 'whatsapp-web.js';
import { Business } from '../../../../../database/entities/business.entity';
import { sendVariantsList } from './variant.flow';
import { Repository } from 'typeorm/repository/Repository';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';


/**
 * Send a compact numbered product list (no images)
 */
// export async function sendProductList(
//     client: Client,
//     phone: string,
//     products: any[],
//     botMessageRepo: Repository<BotMessage>,
//     language: string
// ) {
//     if (!products || products.length === 0) {
//         const text = await getBotMessage(botMessageRepo, bus ,'product_file_no_products_category', language);
//         await client.sendMessage(phone, text);
//         return;
//     }

//     let msg = '🛍️ *Products*\n\n';
//     products.forEach((p, i) => {
//         const stock = (p.variants || []).reduce((s: number, v: any) => s + (v.stock ?? 0), 0);
//         msg += `${i + 1}. ${p.name} \n💰 From: Rs.${p.base_price} \n📦 Stock: ${stock}\n\n`;
//     });

//     const prompt = await getBotMessage(botMessageRepo, 'product_file_enter_product_number', language);
//     msg += `\n${prompt}`;

//     await client.sendMessage(phone, msg);
// }

/**
 * Send detailed products with images and variants
 */
// export async function sendProducts(
//     client: Client,
//     phone: string,
//     products: any[],
//     botMessageRepo: Repository<BotMessage>,
//     language: string
// ) {
//     for (const p of products) {
//         const mainImage = p.images?.find((img: any) => img.is_main)?.image_url;

//         const totalStock = (p.variants || []).reduce((s: number, v: any) => s + (v.stock ?? 0), 0);
//         const variantsText = (p.variants || []).map((v: any) => `• ${v.variant_name} - Rs.${v.price} (${v.stock})`).join('\n');

//         const caption = `📦 *${p.name}*\n${p.description ? `📝 ${p.description}\n\n` : ''}💰 *Base Price:* Rs.${p.base_price}\n📦 *Stock:* ${totalStock} units\n\n${variantsText}\n\n`;

//         const prompt = await getBotMessage(botMessageRepo, 'product_file_enter_product_number', language);
//         const fullCaption = caption + prompt;

//         if (mainImage) {
//             try {
//                 const media = MessageMedia.fromFilePath(`./${mainImage}`);
//                 await client.sendMessage(phone, media, { caption: fullCaption });
//             } catch (err) {
//                 await client.sendMessage(phone, fullCaption);
//             }
//         } else {
//             await client.sendMessage(phone, fullCaption);
//         }
//     }
// }

/**
 * Send variant menu for a product
 */
// export async function sendVariantMenu(
//     client: Client,
//     phone: string,
//     product: any,
//     botMessageRepo: Repository<BotMessage>,
//     language: string
// ) {
//     if (!product) {
//         const text = await getBotMessage(botMessageRepo, 'product_file_product_not_found', language);
//         await client.sendMessage(phone, text);
//         return;
//     }

//     const variants = product.variants || [];
//     if (variants.length === 0) {
//         const text = await getBotMessage(botMessageRepo, 'product_file_no_products_category', language);
//         await client.sendMessage(phone, text);
//         return;
//     }

//     let msg = await getBotMessage(botMessageRepo, 'product_file_variant_menu_header', language);
//     msg = msg.replace('{product_name}', product.name) + '\n\n';

//     variants.forEach((v: any, i: number) => {
//         msg += `${i + 1}. ${v.variant_name} - Rs.${v.price} (${v.stock} available)\n`;
//     });

//     const prompt = await getBotMessage(botMessageRepo, 'product_file_enter_variant_number', language);
//     msg += `\n${prompt}`;

//     await client.sendMessage(phone, msg);
// }

/**
 * Handle product selection
 */
export async function handleProductSelection(
    client: Client,
    phone: string,
    business: Business,
    stateData: any,
    text: number,
    saveUserState: Function,
    productRepo: Repository<any>,
    botMessageRepo: Repository<BotMessage>,
    language: string
) {
    let products: any[] = [];

    if (stateData.subSubId === 0) {
        const subCategory = business.categories
            .flatMap(c => c.subcategories ?? [])
            .find(s => s.id === stateData.subCategoryId);

        if (!subCategory) {
            const msg = await getBotMessage(botMessageRepo, business.id ,'product_file_subcategory_not_found', language);
            await client.sendMessage(phone, msg);
            return;
        }

        products = (subCategory.products || []).filter(
            p => p.is_active && (!p.subsubCategory || p.subsubCategory === null)
        );
    } else {
        const subSub = business.categories
            .flatMap(c => c.subcategories ?? [])
            .flatMap(s => s.subsubcategories ?? [])
            .find(ss => ss.id === stateData.subSubId);

        if (!subSub || !subSub.products) {
            const msg = await getBotMessage(botMessageRepo, business.id, 'product_file_no_products_subsub', language);
            await client.sendMessage(phone, msg);
            return;
        }

        products = subSub.products.filter(p => p.is_active);
    }

    const productIndex = text - 1;
    const product = products[productIndex];

    if (!product) {
        const msg = await getBotMessage(botMessageRepo, business.id, 'product_file_invalid_product_selection', language);
        await client.sendMessage(phone, msg);
        return;
    }

    stateData.productId = product.id;

    await sendVariantsList(client, phone, business, product.id, business.id, stateData, saveUserState, productRepo, botMessageRepo, language);
    await saveUserState(business.id, phone, '', stateData, 'variant_selection');
}
