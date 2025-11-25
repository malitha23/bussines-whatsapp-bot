import { Client } from 'whatsapp-web.js';
import { Repository } from 'typeorm';

export async function handleCancellationResponse(
  client: Client,
  phone: string,
  text: string,
  businessId: number,
  name: string,
  saveUserState: Function,
  userStateRepo: Repository<any>, // Your UserState entity
  language: string
) {
  // Fetch current user state
  const userState = await userStateRepo.findOne({ where: { phone, business_id: businessId } });
  const stateData: any = userState?.last_message ? JSON.parse(userState.last_message) : {};

  if (!stateData.orderId) {
    await client.sendMessage(
      phone,
      '❌ Oops! Something went wrong.\n\n0️⃣ Type *0* to go back to the main menu.'
    );

    // Save state as main_menu so that if user types 0 it goes to main menu
    await saveUserState(businessId, phone, name, {}, 'main_menu', language, 'main_menu');
    return 'error';
  }


  const textUpper = text.trim().toUpperCase();

  if (textUpper === 'YES') {
    // User wants to cancel → ask for reason
    await client.sendMessage(phone, '⚠️ Okay! Please type the reason for cancellation:');
    await saveUserState(businessId, phone, name, stateData, 'enter_cancellation_reason');
  } else if (textUpper === 'NO') {
    // User does NOT want to cancel → friendly message + return to main menu
    await client.sendMessage(
      phone,
      '😊 Got it! Your order will remain as it is.\n\n0️⃣ Back to Menu'
    );
    await saveUserState(businessId, phone, name, {}, 'main_menu', language, 'main_menu');
  } else {
    // Invalid input
    await client.sendMessage(
      phone,
      '⚠️ Please type YES if you want to cancel or NO if you want to keep your order.'
    );
  }
}
