import { Client } from 'whatsapp-web.js';
import { Repository } from 'typeorm';
import { Order } from '../../../../../database/entities/order.entity';
import { UserState } from '../../../../../database/entities/user_states.entity';



export async function handleUploadPaymentReceipt(
  client: Client,
  phone: string,
  businessId: number,
  name: string,
  cleanText: string,
  language: string,
  saveUserState: Function,
  sendMainMenu: Function,
) {
  if (cleanText === '1') {
          await saveUserState(businessId, phone, name, {}, 'select_order_for_receipt_upload');
          await client.sendMessage(phone, "📄 Please enter your *Order ID* to upload the payment receipt.");
          return;
        }

        if (cleanText === '2') {
          await client.sendMessage(phone, "ℹ️ Please contact customer support for help with payment receipts.\n\n➡️ Type 0 to go back.");
          return;
        }

        if (cleanText === '0') {
          await sendMainMenu(client, phone, businessId, 'Business', language);
          await saveUserState(businessId, phone, name, {}, 'main_menu');
          return;
        }

        await client.sendMessage(phone, "❌ Invalid option. Type 1, 2, or 0 to go back.");
}
