import { Client } from 'whatsapp-web.js';
import { Repository } from 'typeorm';
import { Order } from '../../../../../database/entities/order.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';


export async function selectOrderForReceiptUpload(
  client: Client,
  phone: string,
  businessId: number,
  name: string,
  cleanText: string,
  language: string,
  saveUserState: Function,
  orderRepo: Repository<Order>,
  botMessageRepo: Repository<BotMessage>,
  handleUploadPaymentReceipt: Function, // callback for option 0
  sendMainMenu: Function
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
    await client.sendMessage(phone, invalidMsg);
    return;
  }

  // ---- Check order exists & belongs to this phone number ----
  const order = await orderRepo.findOne({
    where: { id: Number(selectedOrderId), business: { id: businessId }, payment_method: 'deposit' },
    relations: ['customer']
  });

  if (!order || order.customer?.phone !== phone) {
    const notFoundMsg = await getBotMessage(botMessageRepo, businessId, language ,'upload_receipt_order_not_found');
    await client.sendMessage(phone, notFoundMsg.replace('{orderId}', selectedOrderId));
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
  await client.sendMessage(phone, uploadMsg.replace('{orderId}', selectedOrderId));
}
