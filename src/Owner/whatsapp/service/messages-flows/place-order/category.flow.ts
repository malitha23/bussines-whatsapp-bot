import { Repository } from 'typeorm';
import { Business } from '../../../../../database/entities/business.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity'; // Your BotMessage entity

export async function showCategories(
  client: any,
  phone: string,
  businessId: number,
  language: string,
  businessRepo: Repository<Business>,
  botMessageRepo: Repository<BotMessage>,
  sendManager: any,
) {
  // Fetch the business with relations
  const business = await businessRepo.findOne({
    where: { id: businessId },
    relations: [
      'categories',
      'categories.subcategories',
      'categories.subcategories.subsubcategories',
      'categories.subcategories.subsubcategories.products',
    ],
  });

  if (!business) {
    const msgRow = await botMessageRepo.findOne({
      where: {
        business_id: businessId,
        language,
        key_name: 'select_category_business_not_found',
      },
    });
    await sendManager.sendMessage({
      phone,
      text: msgRow?.text || '❌ Business not found.',
    });
    return { nextState: null };
  }

  const categories = business.categories || [];

  if (categories.length === 0) {
    const msgRow = await botMessageRepo.findOne({
      where: {
        business_id: businessId,
        language,
        key_name: 'select_category_no_categories',
      },
    });
    await sendManager.sendMessage({
      phone,
      text: msgRow?.text || '❌ No categories available for ordering.',
    });
    return { nextState: null };
  }

  // Only one category → auto-select
  if (categories.length === 1) {
    const cat = categories[0];
    const msgRow = await botMessageRepo.findOne({
      where: {
        business_id: businessId,
        language,
        key_name: 'select_category_only_one_category',
      },
    });

    const msg = (
      msgRow?.text ||
      `📂 Only one category found: *{categoryName}*\nShowing its subcategories: *{categoryName}*`
    ).replace(/{categoryName}/g, cat.name);

    await sendManager.sendMessage(phone, { text: msg });

    return {
      nextState: 'subcategory_selection',
      selectedCategory: cat,
      autoShowSubcategories: true,
    };
  }

  // Multiple categories → show numbered list
  const msgRow = await botMessageRepo.findOne({
    where: { business_id: businessId, language, key_name: 'select_category' },
  });
  let msg = `${msgRow?.text}\n\n` || '📂 *Please select a category:\n\n';
  categories.forEach((cat, idx) => {
    msg += `${idx + 1}️⃣ ${cat.name}\n`;
  });

  // Add Go Back message
  const goBackRow = await botMessageRepo.findOne({
    where: {
      business_id: businessId,
      language,
      key_name: 'select_category_go_back',
    },
  });
  msg += `\n${goBackRow?.text || '➡️ Go Back: Type 0'}`;

  await sendManager.sendMessage({ phone, text: msg });
  return { nextState: 'category_selection' };
}
