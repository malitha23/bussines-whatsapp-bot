import { Client } from 'whatsapp-web.js';
import { Business } from '../../../../../database/entities/business.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { sendProducts } from './subsub-category.flow';
import { Repository } from 'typeorm';

export async function selectSubCategory(
  client: Client,
  phone: string,
  business: Business,
  categoryIndex: number,
  language: string,
  botMessageRepo: Repository<BotMessage>,
) {
  const categories = business.categories || [];
  const category = categories[categoryIndex - 1];

  // ❌ Invalid category
  if (!category) {
    const errMsg = await botMessageRepo.findOne({
      where: {
        business_id: business.id,
        language,
        key_name: 'select_subcategory_invalid',
      },
    });

    await client.sendMessage(phone, errMsg?.text || '❌ Invalid subcategory. Try again.');
    return { nextState: 'category_selection' };
  }

  const subcategories = category.subcategories || [];

  // 📦 No subcategories → show products
  if (subcategories.length === 0) {
    const noSubMsg = await botMessageRepo.findOne({
      where: {
        business_id: business.id,
        language,
        key_name: 'select_subcategory_none',
      },
    });

    await client.sendMessage(phone, noSubMsg?.text || '📦 Showing products...');
    await sendProducts(client, phone, category.products || []);

    return { nextState: 'main_menu' };
  }

  // 📂 Only 1 subcategory → auto-select
  if (subcategories.length === 1) {
    const oneMsg = await botMessageRepo.findOne({
      where: {
        business_id: business.id,
        language,
        key_name: 'select_subcategory_only_one',
      },
    });

    const msg = (oneMsg?.text || '📂 Only one subcategory: *{subName}*')
      .replace('{subName}', subcategories[0].name);

    await client.sendMessage(phone, msg);

    return {
      nextState: 'subsub_category_selection',
      selectedSubcategory: subcategories[0],
    };
  }

  // 📂 Multiple subcategories → list them
  const selectMsg = await botMessageRepo.findOne({
    where: {
      business_id: business.id,
      language,
      key_name: 'select_subcategory',
    },
  });

  const backMsg = await botMessageRepo.findOne({
    where: {
      business_id: business.id,
      language,
      key_name: 'select_subcategory_go_back',
    },
  });

  // ✔️ Correct message building
  let msg = (selectMsg?.text || '📂 Please select a subcategory:') + '\n\n';

  subcategories.forEach((sub, idx) => {
    msg += `${idx + 1}️⃣ ${sub.name}\n`;
  });

  msg += `\n${backMsg?.text || '➡️ Go Back: Type 0'}`;

  await client.sendMessage(phone, msg);

  return { nextState: 'subcategory_selection' };
}
