import { Business } from '../../../../../database/entities/business.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { Repository } from 'typeorm';

export async function selectSubCategory(
  client: any,
  phone: string,
  businessId: number,
  businessRepo: Repository<Business>,
  categoryInput: any,
  language: string,
  botMessageRepo: Repository<BotMessage>,
  sendManager: any,
) {
  const business = await businessRepo.findOne({
    where: { id: businessId },
    relations: [
      'categories',
      'categories.subcategories',
      'categories.subcategories.subsubcategories',
      'categories.subcategories.subsubcategories.products',
    ],
  });
  const categories = business!.categories || [];

  let category;

  // Handle different input types
  if (typeof categoryInput === 'number') {
    // If it's a number, it could be an index (1-based) or an ID
    // First check if it's an ID
    category = categories.find((c) => c.id === categoryInput);

    // If not found by ID, check if it's an index
    if (!category && categoryInput >= 1 && categoryInput <= categories.length) {
      category = categories[categoryInput - 1];
    }
  } else if (categoryInput && typeof categoryInput === 'object') {
    // If it's a category object
    category = categoryInput;
  } else if (categoryInput && typeof categoryInput === 'string') {
    // If it's a string, try to parse as number
    const num = parseInt(categoryInput);
    if (!isNaN(num)) {
      category = categories.find((c) => c.id === num);
      if (!category && num >= 1 && num <= categories.length) {
        category = categories[num - 1];
      }
    }
  }

  if (!category) {
    const errMsg = await botMessageRepo.findOne({
      where: {
        business_id: business!.id,
        language,
        key_name: 'select_subcategory_invalid',
      },
    });

    await sendManager.sendMessage({
      phone,
      text:
        errMsg?.text ||
        '❌ Invalid selection. Please try again or type 0 to go back.',
    });

    return { nextState: 'category_selection' };
  }

  const subcategories = category.subcategories || [];

  // 📦 No subcategories → show products
  if (subcategories.length === 0) {
    const noSubMsg = await botMessageRepo.findOne({
      where: {
        business_id: business!.id,
        language,
        key_name: 'select_subcategory_none',
      },
    });

    await sendManager.sendMessage({ phone, text: noSubMsg?.text || '' });

    return { nextState: 'main_menu' };
  }

  // 📂 Only 1 subcategory → show with number for input
  if (subcategories.length === 1) {
    // Fetch the message template from DB for the current language
    const oneMsg = await botMessageRepo.findOne({
      where: {
        business_id: business!.id,
        language,
        key_name: 'select_subcategory_only_one',
      },
    });

    const sub = subcategories[0];

    // Replace placeholder {subName} with actual subcategory name
    const msg = (
      oneMsg?.text || 'Send the number of the type you want to see'
    ).replace('{subName}', sub.name);

    await sendManager.sendMessage({ phone, text: msg });

    return {
      nextState: 'subsub_category_selection',
      selectedSubcategory: sub,
    };
  }

  // 📂 Multiple subcategories → list them
  const selectMsg = await botMessageRepo.findOne({
    where: {
      business_id: business!.id,
      language,
      key_name: 'select_subcategory',
    },
  });

  const backMsg = await botMessageRepo.findOne({
    where: {
      business_id: business!.id,
      language,
      key_name: 'select_subcategory_go_back',
    },
  });

  // ✔️ Correct message building
  let msg = (selectMsg?.text || '📂 Please select a subcategory:') + '\n\n';

  subcategories.forEach((sub: { name: any }, idx: number) => {
    msg += `${idx + 1}️⃣ ${sub.name}\n`;
  });

  msg += `\n${backMsg?.text || '➡️ Go Back: Type 0'}`;

  await sendManager.sendMessage({ phone, text: msg });

  return { nextState: 'subcategory_selection' };
}
