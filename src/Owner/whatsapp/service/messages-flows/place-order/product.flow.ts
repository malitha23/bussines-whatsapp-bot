import { Client, MessageMedia } from 'whatsapp-web.js';
import { Business } from '../../../../../database/entities/business.entity';
import { sendVariantsList } from './variant.flow';
import { Repository } from 'typeorm/repository/Repository';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';

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
