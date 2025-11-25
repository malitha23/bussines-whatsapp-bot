// src/whatsapp/flows/place-order/customer-data.flow.ts

import { Client } from 'whatsapp-web.js';
import { Repository } from 'typeorm';
import { Customer } from '../../../../../database/entities/customer.entity';
import { ProductVariant } from '../../../../../database/entities/product-variant.entity';
import { getBotMessage } from '../../../helpers/getBotMessage'; 
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';


export async function handleCustomerDetails(
  client: Client,
  phone: string,
  text: string,
  state: string,
  stateData: any,
  businessId: number,
  language: string,
  saveState: Function,
  customerRepo: Repository<Customer>,
  variantRepo: Repository<ProductVariant>,
  botMessageRepo: Repository<BotMessage>
) {
  text = text.trim();
  if (!stateData || typeof stateData !== 'object') stateData = {};

  /* ===========================================================
       🔙 BACK OPTION
  ============================================================ */
  if (text === '0' && !['collect_customer_email', 'collect_customer_phone'].includes(state)) {
    switch (state) {
      case 'collect_customer_name': {
        await saveState(businessId, phone, '', stateData, 'quantity_input');

        const selectedVariant = await variantRepo.findOne({
          where: { id: stateData.variantId },
          relations: ['product']
        });

        if (selectedVariant?.product) {
          await client.sendMessage(
            phone,
            `${await getBotMessage(botMessageRepo, businessId, language, 'customer_data_back_to_quantity')}\n` +
            `➡️ Enter quantity in *${selectedVariant.product.name}* ${selectedVariant.variant_name} or 0 to go back.`
          );
        } else {
          await client.sendMessage(phone, `⚠️ Could not load previous variant.`);
        }
        return;
      }

      case 'collect_customer_address':
        await saveState(businessId, phone, '', stateData, 'collect_customer_name');
        await client.sendMessage(
          phone,
          await getBotMessage(botMessageRepo, businessId, language, 'customer_data_back_to_name')
        );
        return;
    }
  }

  /* ===========================================================
       ➡️ FORWARD FLOW
  ============================================================ */
  switch (state) {

    /* ---------------------------
          NAME
    ---------------------------- */
    case 'collect_customer_name':
      stateData.customerName = text;

      await saveState(businessId, phone, '', stateData, 'collect_customer_address');

      await client.sendMessage(
        phone,
        await getBotMessage(botMessageRepo, businessId, language, 'customer_data_enter_address')
      );
      return;

    /* ---------------------------
          ADDRESS
    ---------------------------- */
    case 'collect_customer_address':
      stateData.customerAddress = text;

      await saveState(businessId, phone, '', stateData, 'collect_customer_email');

      await client.sendMessage(
        phone,
        await getBotMessage(botMessageRepo, businessId, language, 'customer_data_enter_email')
      );
      return;

    /* ---------------------------
          EMAIL
    ---------------------------- */
    case 'collect_customer_email':
      stateData.customerEmail = text === '0' ? null : text;

      await saveState(businessId, phone, '', stateData, 'collect_customer_phone');

      await client.sendMessage(
        phone,
        await getBotMessage(botMessageRepo, businessId, language, 'customer_data_enter_phone')
      );
      return;

    /* ---------------------------
          PHONE & SAVE
    ---------------------------- */
    case 'collect_customer_phone':
      stateData.customerPhone = text === '0'
        ? phone.split('@')[0]
        : text;

      // Try to find customer
      let customer = await customerRepo.findOne({
        where: { phone, business: { id: businessId } },
        relations: ['business']
      });

      // Create new customer
      if (!customer) {
        customer = customerRepo.create({
          name: stateData.customerName,
          phone,
          business: { id: businessId },
          email: stateData.customerEmail,
          address: stateData.customerAddress
        });
      } else {
        // Update existing customer
        customer.name = stateData.customerName;
        customer.email = stateData.customerEmail || customer.email;
        customer.address = stateData.customerAddress || customer.address;
      }

      await customerRepo.save(customer);
      stateData.customer = customer;

      await saveState(businessId, phone, '', stateData, 'confirm_order');

      /* ===========================================================
           📌 SEND FINAL CONFIRM MESSAGE (DB-based)
      ============================================================ */
      const title = await getBotMessage(botMessageRepo, businessId, language, 'customer_data_confirm_details_title');
      const labelName = await getBotMessage(botMessageRepo, businessId, language, 'customer_data_label_name');
      const labelAddress = await getBotMessage(botMessageRepo, businessId, language, 'customer_data_label_address');
      const labelPhone = await getBotMessage(botMessageRepo, businessId, language, 'customer_data_label_phone');
      const labelEmail = await getBotMessage(botMessageRepo, businessId, language, 'customer_data_label_email');
      const confirmInstruction = await getBotMessage(botMessageRepo, businessId, language, 'customer_data_confirm_instruction');

      const changeName = await getBotMessage(botMessageRepo, businessId, language, 'customer_data_change_name');
      const changeAddress = await getBotMessage(botMessageRepo, businessId, language, 'customer_data_change_address');
      const changeEmail = await getBotMessage(botMessageRepo, businessId, language, 'customer_data_change_email');
      const changePhone = await getBotMessage(botMessageRepo, businessId, language, 'customer_data_change_phone');

      const finalMessage =
        `${title}\n\n` +
        `${labelName} ${stateData.customerName}\n` +
        `${labelAddress} ${stateData.customerAddress}\n` +
        `${labelPhone} ${stateData.customerPhone}\n` +
        (stateData.customerEmail ? `${labelEmail} ${stateData.customerEmail}\n` : '') +
        `\n${confirmInstruction}\n` +
        `${changeName}\n` +
        `${changeAddress}\n` +
        `${changeEmail}\n` +
        `${changePhone}`;

      await client.sendMessage(phone, finalMessage);
      return;
  }
}
