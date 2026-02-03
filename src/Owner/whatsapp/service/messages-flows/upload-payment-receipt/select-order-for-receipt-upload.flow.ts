
import { IsNull, Repository } from 'typeorm';
import { Order } from '../../../../../database/entities/order.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';


export async function selectOrderForReceiptUpload(
  client: any,
  phone: string,
  businessId: number,
  name: string,
  cleanText: string,
  language: string,
  saveUserState: Function,
  orderRepo: Repository<Order>,
  botMessageRepo: Repository<BotMessage>,
  handleUploadPaymentReceipt: Function, // callback for option 0
  sendMainMenu: Function,
  sendManager: any
) {
  const selectedOrderId = cleanText;

  // ---- Go back to previous menu ----
  if (cleanText === '0') {
    await handleUploadPaymentReceipt(
      client,
      phone,
      businessId,
      name,
      cleanText,
      language,
      saveUserState,
      sendMainMenu,
      orderRepo,
      botMessageRepo
    );

    await saveUserState(businessId, phone, name, {}, 'select_receipt_option');
    return;
  }

  // ---- Validate numeric input ----
  if (isNaN(Number(selectedOrderId))) {
    const invalidMsg = await getBotMessage(botMessageRepo, businessId, language, 'upload_receipt_invalid_order_id');
    await sendManager.sendMessage({phone, text: invalidMsg});
    return;
  }

  // ---- Check order exists & belongs to this phone number ----
  const order = await orderRepo.findOne({
    where: {
      id: Number(selectedOrderId), business: { id: businessId }, status: 'pending',
      payment_method: 'deposit',
      payment_receipt_url: IsNull(),
    },
    relations: ['customer']
  });

  if (!order || order.customer?.phone !== phone) {
    const notFoundMsg = await getBotMessage(botMessageRepo, businessId, language, 'upload_receipt_order_not_found');
    await sendManager.sendMessage({phone, text: notFoundMsg.replace('{orderId}', selectedOrderId)});
    return;
  }

  // ---- Save selected order & go to upload step ----
  const stateData = {
    orderId: Number(selectedOrderId),
    customer: {
      id: order.customer.id,
      phone: order.customer.phone
    }
  };

  await saveUserState(
    businessId,
    phone,
    name,
    stateData,
    'upload_payment_receipt'
  );

  // ---- Ask for the receipt image ----
  const uploadMsg = await getBotMessage(botMessageRepo, businessId, language, 'upload_receipt_ask_image');
  await sendManager.sendMessage({phone, text: uploadMsg.replace('{orderId}', selectedOrderId)});
}
