import { Repository } from 'typeorm';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';

export async function handleCancellationResponse(
  client: any,
  phone: string,
  text: string,
  businessId: number,
  name: string,
  saveUserState: Function,
  userStateRepo: Repository<any>, // Your UserState entity
  botMessageRepo: Repository<BotMessage>,
  language: string,
  sendManager: any,
) {
  // Fetch current user state
  const userState = await userStateRepo.findOne({
    where: { phone, business_id: businessId },
  });
  const stateData: any = userState?.last_message
    ? JSON.parse(userState.last_message)
    : {};

  if (!stateData.orderId) {
    const errMsg = await getBotMessage(
      botMessageRepo,
      businessId,
      language,
      'cancellation_error_no_order',
    );
    await sendManager.sendMessage({ phone, text: errMsg });

    await saveUserState(
      businessId,
      phone,
      name,
      {},
      'main_menu',
      language,
      'main_menu',
    );
    return 'error';
  }

  const textUpper = text.trim().toUpperCase();

  if (textUpper === 'YES') {
    // Ask for cancellation reason
    const reasonMsg = await getBotMessage(
      botMessageRepo,
      businessId,
      language,
      'cancellation_ask_reason',
    );
    await sendManager.sendMessage({ phone, text: reasonMsg });

    await saveUserState(
      businessId,
      phone,
      name,
      stateData,
      'enter_cancellation_reason',
    );
  } else if (textUpper === 'NO') {
    // Keep order → back to menu
    const keepMsg = await getBotMessage(
      botMessageRepo,
      businessId,
      language,
      'cancellation_keep_order',
    );
    await sendManager.sendMessage({ phone, text: keepMsg });

    await saveUserState(
      businessId,
      phone,
      name,
      {},
      'main_menu',
      language,
      'main_menu',
    );
  } else {
    // Invalid input
    const invalidMsg = await getBotMessage(
      botMessageRepo,
      businessId,
      language,
      'cancellation_invalid_input',
    );
    await sendManager.sendMessage({ phone, text: invalidMsg });
  }
}
