import { Business } from '../../../../../database/entities/business.entity';
import { sendVariantsList } from './variant.flow';
import { Repository } from 'typeorm/repository/Repository';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';

/**
 * Handle product selection
 */
export async function handleProductSelection(
  client: any,
  phone: string,
  business: Business,
  stateData: any,
  text: number | string,
  saveUserState: Function,
  productRepo: Repository<any>,
  botMessageRepo: Repository<BotMessage>,
  language: string,
  sendManager: any,
) {
  const categories = business.categories ?? [];
  let products: any[] = [];

  /* -------------------------------
     GET PRODUCTS BY CONTEXT
  -------------------------------- */

  if (stateData.subSubId === 0) {
    const subCategory = categories
      .flatMap((c) => c.subcategories ?? [])
      .find((s) => s.id === stateData.subCategoryId);

    if (!subCategory) {
      const msg = await getBotMessage(
        botMessageRepo,
        business.id,
        language,
        'product_file_subcategory_not_found',
      );
      await sendManager.sendMessage({ phone, text: msg });
      return;
    }

    products = (subCategory.products ?? []).filter(
      (p) => p.is_active && (!p.subsubCategory || p.subsubCategory === null),
    );
  } else {
    const subSub = categories
      .flatMap((c) => c.subcategories ?? [])
      .flatMap((s) => s.subsubcategories ?? [])
      .find((ss) => ss.id === stateData.subSubId);

    if (!subSub || !Array.isArray(subSub.products)) {
      const msg = await getBotMessage(
        botMessageRepo,
        business.id,
        language,
        'product_file_no_products_subsub',
      );
      await sendManager.sendMessage({ phone, text: msg });
      return;
    }

    products = subSub.products.filter((p) => p.is_active);
  }

  /* -------------------------------
     VALIDATE USER INPUT
  -------------------------------- */

  const productIndex = Number(text) - 1;

  if (isNaN(productIndex) || productIndex < 0 || productIndex >= products.length) {
    const msg = await getBotMessage(
      botMessageRepo,
      business.id,
      language,
      'product_file_invalid_product_selection',
    );
    await sendManager.sendMessage({ phone, text: msg });
    return;
  }

  const product = products[productIndex];

  if (!product) {
    const msg = await getBotMessage(
      botMessageRepo,
      business.id,
      language,
      'product_file_invalid_product_selection',
    );
    await sendManager.sendMessage({ phone, text: msg });
    return;
  }

  /* -------------------------------
     SAVE STATE & CONTINUE
  -------------------------------- */

  stateData.productId = product.id;

  await sendVariantsList(
    client,
    phone,
    business,
    product.id,
    business.id,
    stateData,
    saveUserState,
    productRepo,
    botMessageRepo,
    language,
    sendManager,
  );

  await saveUserState(
    business.id,
    phone,
    '',
    stateData,
    'variant_selection',
  );
}
