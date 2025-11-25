// src/whatsapp/flows/place-order/confirm-order.flow.ts
import { Client } from "whatsapp-web.js";
import { Repository } from "typeorm";
import { BusinessPaymentOption } from "../../../../../database/entities/business-payment-options.entity";
import { getBotMessage } from "../../../helpers/getBotMessage";
import { BotMessage } from "../../../../../database/entities/bot-messages.entity";

export async function confirmOrder(
  client: Client,
  phone: string,
  text: string,
  stateData: any,
  businessId: number,
  language: string,
  saveState: Function,
  businessPaymentOptionRepo: Repository<BusinessPaymentOption>,
  botMessageRepo: Repository<BotMessage>,
) {
  text = text.trim().toLowerCase();

  // Map emoji to numbers
  const emojiToNumber: Record<string, string> = { '1️⃣': '1', '2️⃣': '2', '3️⃣': '3', '4️⃣': '4', '5️⃣': '5' };
  if (emojiToNumber[text]) text = emojiToNumber[text];

  switch (text) {
    case 'yes':
      // Fetch enabled payment options from DB
      const options = await businessPaymentOptionRepo.find({
        where: { business: { id: businessId }, enabled: 1 },
      });

      if (!options.length) {
        await client.sendMessage(phone, await getBotMessage(botMessageRepo, businessId, language, 'confirm_order_no_payment_options'));
        return;
      }

      // Build dynamic payment menu
      let menuMessage = await getBotMessage(botMessageRepo, businessId, language, 'confirm_order_payment_prompt') + '\n\n';
      options.forEach((opt, idx) => {
        menuMessage += `${idx + 1}️⃣ ${opt.option_name}\n`;
      });

      await client.sendMessage(phone, menuMessage);
      await saveState(businessId, phone, '', stateData, 'select_payment_method');
      break;

    case 'no':
      await client.sendMessage(phone, await getBotMessage(botMessageRepo, businessId, language, 'confirm_order_canceled'));
      await saveState(businessId, phone, '', {}, 'main_menu');
      break;

    case '1':
      await saveState(businessId, phone, '', stateData, 'collect_customer_name');
      await client.sendMessage(phone, await getBotMessage(botMessageRepo, businessId, language, 'confirm_order_edit_name'));
      break;

    case '2':
      await saveState(businessId, phone, '', stateData, 'collect_customer_address');
      await client.sendMessage(phone, await getBotMessage(botMessageRepo, businessId, language, 'confirm_order_edit_address'));
      break;

    case '3':
      await saveState(businessId, phone, '', stateData, 'collect_customer_email');
      await client.sendMessage(phone, await getBotMessage(botMessageRepo, businessId, language, 'confirm_order_edit_email'));
      break;

    case '4':
      await saveState(businessId, phone, '', stateData, 'collect_customer_phone');
      await client.sendMessage(phone, await getBotMessage(botMessageRepo, businessId, language, 'confirm_order_edit_phone'));
      break;

    default:
      await client.sendMessage(
        phone,
        await getBotMessage(botMessageRepo, businessId, language, 'confirm_order_invalid_option')
      );
      break;
  }
}
