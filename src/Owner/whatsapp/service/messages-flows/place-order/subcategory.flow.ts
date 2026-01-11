import { Client } from 'whatsapp-web.js';
import { Business } from '../../../../../database/entities/business.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { sendProducts } from './subsub-category.flow';
import { Repository } from 'typeorm';

export async function selectSubCategory(
  client: Client,
  phone: string,
  business: Business,
  categoryInput: any, 
  language: string,
  botMessageRepo: Repository<BotMessage>,
) {
  const categories = business.categories || [];
  
  console.log(`DEBUG selectSubCategory: categoryInput=`, categoryInput, `type=`, typeof categoryInput);
  console.log(`DEBUG: Available categories:`, categories.map(c => ({id: c.id, name: c.name})));
  
  let category;
  
  // Handle different input types
  if (typeof categoryInput === 'number') {
    // If it's a number, it could be an index (1-based) or an ID
    // First check if it's an ID
    category = categories.find(c => c.id === categoryInput);
    
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
      category = categories.find(c => c.id === num);
      if (!category && num >= 1 && num <= categories.length) {
        category = categories[num - 1];
      }
    }
  }
  
  // ❌ Invalid category
  if (!category) {
    console.log(`DEBUG: Category not found. Input was:`, categoryInput);
    console.log(`DEBUG: Available category IDs:`, categories.map(c => c.id));
    
    const errMsg = await botMessageRepo.findOne({
      where: {
        business_id: business.id,
        language,
        key_name: 'select_subcategory_invalid',
      },
    });

    await client.sendMessage(
      phone, 
      errMsg?.text || '❌ Invalid selection. Please try again or type 0 to go back.'
    );
    return { nextState: 'category_selection' };
  }

  console.log(`DEBUG: Found category:`, category.name, `ID:`, category.id);

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

  subcategories.forEach((sub: { name: any; }, idx: number) => {
    msg += `${idx + 1}️⃣ ${sub.name}\n`;
  });

  msg += `\n${backMsg?.text || '➡️ Go Back: Type 0'}`;

  await client.sendMessage(phone, msg);

  return { nextState: 'subcategory_selection' };
}
