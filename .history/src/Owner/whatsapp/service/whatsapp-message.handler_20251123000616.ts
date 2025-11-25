import { Injectable } from '@nestjs/common';
import { Client, MessageMedia } from 'whatsapp-web.js';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UserState } from '../../../database/entities/user_states.entity';
import { Business } from '../../../database/entities/business.entity';
import { showCategories } from './messages-flows/place-order/category.flow';
import { selectSubCategory } from './messages-flows/place-order/subcategory.flow';
import { selectSubSubCategory, sendProductsList } from './messages-flows/place-order/subsub-category.flow';
import { MessagesService } from './MessagesService/MessagesService';
import { BotMessage } from '../../../database/entities/bot-messages.entity';
import { handleVariantSelection, sendVariantsList } from './messages-flows/place-order/variant.flow';
import { handleQuantityInput } from './messages-flows/place-order/quantity.flow';
import { handleCustomerDetails } from './messages-flows/place-order/customer-data.flow';
import { confirmOrder } from './messages-flows/place-order/confirm-order.flow';
import { Product } from '../../../database/entities/product.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { ProductVariant } from '../../../database/entities/product-variant.entity';
import { handlePaymentMethod, handlePaymentReceipt } from './messages-flows/place-order/customer-payments.flow';
import { Order } from '../../../database/entities/order.entity';
import { OrderItem } from '../../../database/entities/order-item.entity';
import { handleProductSelection } from './messages-flows/place-order/product.flow';
import { OrderCancellation } from '../../../database/entities/order-cancellation.entity';
import { startCancellationFlow } from './messages-flows/my-orders/order-cancellation.flow';
import { handleCancellationResponse } from './messages-flows/my-orders/order-cancellation-response.flow';
import { enterCancellationReason } from './messages-flows/my-orders/order-cancellation-reason.flow';
import { BusinessPaymentOption } from '../../../database/entities/business-payment-options.entity';
import { BusinessDeliveryFee } from '../../../database/entities/business-delivery-fee.entity';
import { handleUploadPaymentReceipt } from './messages-flows/upload-payment-receipt/upload-receipt.flow';

@Injectable()
export class WhatsAppMessageHandler {
  constructor(
    @InjectRepository(UserState)
    private readonly userStateRepo: Repository<UserState>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly messagesService: MessagesService,
    @InjectRepository(BotMessage)
    private readonly botMessageRepo: Repository<BotMessage>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(OrderCancellation)
    private readonly orderCancellationRepo: Repository<OrderCancellation>,
    @InjectRepository(BusinessPaymentOption)
    private readonly businessPaymentOptionRepo: Repository<BusinessPaymentOption>,
    @InjectRepository(BusinessDeliveryFee)
    private readonly deliveryFeeRepo: Repository<BusinessDeliveryFee>

  ) { }

  // ==============================
  // Main handler
  // ==============================
  async handleIncomingMessage(
    client: Client,
    businessId: number,
    phone: string,
    name: string,
    text: string,
    msg: any
  ) {
    const cleanText = text?.trim().toLowerCase();
    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business) return;

    let userState = await this.userStateRepo.findOne({ where: { phone, business_id: businessId } });

    // 🟢 If no language set, ask first
    if (!userState?.language) {
      if (!cleanText || !['1', '2', '3'].includes(cleanText)) {
        await this.sendLanguageSelection(client, phone);
        return;
      }

      let language = cleanText === '1' ? 'en' : cleanText === '2' ? 'si' : 'ta';
      await this.saveUserState(businessId, phone, name, {}, 'main_menu', language);
      await this.sendMainMenu(client, phone, businessId, business.name, language);
      return;
    }

    // Set current language
    const language = userState.language;
    const state = userState?.state || 'main_menu';

    if (state === 'customer_service_mode') {

      const lastMessageData = userState?.last_message
        ? JSON.parse(userState.last_message)
        : {};

      const enteredAt = lastMessageData.enteredAt || null;

      // Calculate hours passed
      const hoursPassed = enteredAt
        ? (Date.now() - enteredAt) / (1000 * 60 * 60) // ms → hours
        : null;

      // Auto exit after 24 hours
      if (hoursPassed && hoursPassed > 24) {
        await client.sendMessage(
          phone,
          "⌛ Your previous customer service session has expired.\n\nType *hi* to start again 😊"
        );

        // Reset to main menu
        await this.saveUserState(businessId, phone, name, {}, 'main_menu');
        return;
      }

      // If user types menu, return to bot
      if (cleanText === 'menu') {
        await this.sendMainMenu(client, phone, businessId, business.name, language);
        await this.saveUserState(businessId, phone, name, {}, 'main_menu');
        return;
      }

      // Otherwise, save the customer message in context (optional)
      lastMessageData.customerServiceMessages = lastMessageData.customerServiceMessages || [];
      lastMessageData.customerServiceMessages.push({
        text,
        date: new Date(),
        from: 'customer'
      });

      await this.saveUserState(businessId, phone, name, lastMessageData, 'customer_service_mode');


      return;
    }



    // === Restart flow ===
    if (cleanText === 'hi' || cleanText === 'hello' || cleanText === 'menu') {
      await this.sendMainMenu(client, phone, businessId, business.name, language);
      await this.saveUserState(businessId, phone, name, {}, 'main_menu', language);
      return;
    }


    // === Main menu back shortcut (only when NOT inside place-order) ===
    const placeOrderStates = new Set([
      'category_selection', 'subcategory_selection',
      'subsub_category_selection', 'product_selection',
      'variant_selection', 'quantity_input',
      'collect_customer_name',
      'collect_customer_address',
      'collect_customer_email',
      'collect_customer_phone',
      'confirm_order',
      'select_payment_method',
      'upload_payment_receipt',
      'post_payment',
      'order_history_menu'
    ]);

    const myOrdersSubMenus = new Set([
      'pending_orders', 'confirmed_orders', 'paid_orders',
      'shipped_orders', 'delivered_orders', 'canceled_orders', 'refunded_orders', 'select_order_for_receipt_upload'
    ]);


    if (cleanText === '0') {

      // If inside a My Orders submenu → go back to order_history_menu
      if (myOrdersSubMenus.has(state)) {

        const prevState = userState?.previous_state || 'main_menu';
        await this.restorePreviousState(client, businessId, phone, name, business, prevState);
        return;
      }

      // If inside place-order → normal back behavior
      if (placeOrderStates.has(state)) {

        const prevState = userState?.previous_state || 'main_menu';
        await this.restorePreviousState(client, businessId, phone, name, business, prevState);
        return;
      }

    }




    // === Handle language change state ===
    if (state === 'language_selection') {
      let newLang: string | null = null;
      if (cleanText === '1') newLang = 'en';
      if (cleanText === '2') newLang = 'si';
      if (cleanText === '3') newLang = 'ta';

      if (newLang) {
        await this.saveUserState(businessId, phone, name, {}, 'main_menu', newLang);
        await this.sendMainMenu(client, phone, businessId, business.name, newLang);
      } else {
        await this.sendLanguageSelection(client, phone); // invalid input
      }
      return;
    }

    // === State handling ===
    switch (state) {

      case 'main_menu':
        await this.handleMainMenu(client, phone, name, businessId, cleanText, language);
        break;

      case 'business_info':
        if (cleanText === '0') {
          // Go back to main menu
          await this.sendMainMenu(client, phone, businessId, business.name, language);
          await this.saveUserState(businessId, phone, name, {}, 'main_menu');
        } else {
          await client.sendMessage(phone, "❌ Invalid input. Type 0 to return to main menu.");
        }
        break;

      case 'order_history_menu':
        await this.handleOrderHistoryMenu(client, phone, name, businessId, cleanText, language);
        break;

      case 'awaiting_order_cancellation':
        await startCancellationFlow(client, phone, cleanText, businessId, name, this.saveUserState.bind(this), this.orderRepo);
        break;

      case 'awaiting_cancellation_reason':
        await handleCancellationResponse(client, phone, cleanText, businessId, name, this.saveUserState.bind(this), this.userStateRepo, language);
        break;

      case 'enter_cancellation_reason':
        await enterCancellationReason(client, phone, text, businessId, name, this.saveUserState.bind(this), this.userStateRepo, this.orderRepo, this.orderCancellationRepo, language);
        break;

      case 'place_order':
      case 'category_selection':
      case 'subcategory_selection':
      case 'subsub_category_selection':
      case 'product_selection':
      case 'variant_selection':
      case 'quantity_input':
        await this.handlePlaceOrder(client, phone, businessId, cleanText, state, language);
        break;
      // ==============================
      // Customer details states
      // ==============================
      case 'enter_customer_details':
      case 'collect_customer_name':
      case 'collect_customer_address':
      case 'collect_customer_email':
      case 'collect_customer_phone':
        {

          const userState = await this.userStateRepo.findOne({ where: { phone, business_id: businessId } });
          const stateData: any = userState?.last_message ? JSON.parse(userState.last_message) : {};

          await handleCustomerDetails(
            client,
            phone,
            text,
            state,
            stateData,
            businessId,
            language,
            this.saveUserState.bind(this),
            this.customerRepo,
            this.variantRepo,
            this.botMessageRepo
          );
        }
        break;


      case 'confirm_order': {

        const userState = await this.userStateRepo.findOne({ where: { phone, business_id: businessId } });
        const stateData: any = userState?.last_message ? JSON.parse(userState.last_message) : {};
        await confirmOrder(client, phone, text, stateData, businessId, language, this.saveUserState.bind(this), this.businessPaymentOptionRepo, this.botMessageRepo);
      }
        break;

      case 'select_payment_method': {
        const userState = await this.userStateRepo.findOne({ where: { phone, business_id: businessId } });
        const stateData: any = userState?.last_message ? JSON.parse(userState.last_message) : {};

        await handlePaymentMethod(client, phone, text, stateData, businessId, language, this.saveUserState.bind(this), this.orderRepo, this.orderItemRepo, this.variantRepo, this.businessPaymentOptionRepo, this.deliveryFeeRepo, this.botMessageRepo);
      }
        break;


      case 'upload_payment_receipt': {
        const userState = await this.userStateRepo.findOne({ where: { phone, business_id: businessId } });
        const stateData: any = userState?.last_message ? JSON.parse(userState.last_message) : {};
        await handlePaymentReceipt(
          client,
          msg,
          phone,
          stateData,
          businessId,
          language,
          this.saveUserState.bind(this),
          this.orderRepo,
          this.botMessageRepo,
        );
      }
        break;

      case 'post_payment':
        if (cleanText === '0') {
          await this.sendMainMenu(client, phone, businessId, business.name, language);
          await this.saveUserState(businessId, phone, name, {}, 'main_menu');
        } else {
          await client.sendMessage(phone, "Type 0 to return to main menu.");
        }
        break;
      case 'select_receipt_option':

        if (cleanText === '0') {
          // Back to Main Menu
          await this.sendMainMenu(client, phone, businessId, business.name, language);
          await this.saveUserState(businessId, phone, name, {}, 'main_menu');
          return;
        }

        // User selects "existing order"
        await handleUploadPaymentReceipt(
          client,
          phone,
          businessId,
          name,
          cleanText,
          language,
          this.saveUserState.bind(this),
          this.sendMainMenu.bind(this),
          this.orderRepo
        );
        break;

      case 'select_order_for_receipt_upload': {
        const userState = await this.userStateRepo.findOne({
          where: { phone, business_id: businessId }
        });

        const stateData = userState?.last_message
          ? JSON.parse(userState.last_message)
          : {};

        const selectedOrderId = cleanText;

        // ---- Validate numeric input ----
        if (cleanText === '0') {
          // Go back to previous menu
          await import('./messages-flows/my-orders/order-history-menu.flow')
            .then(m => m.showOrderHistoryMenu(client, phone));
          await this.saveUserState(businessId, phone, name, {}, 'order_history_menu');
          return;
        }

        if (isNaN(Number(selectedOrderId))) {
          await client.sendMessage(
            phone,
            "❌ Invalid Order ID.\nPlease enter a valid number.\n\n➡️ Type 0 to go back."
          );
          return;
        }

        // ---- Check order exists & belongs to this phone number ----
        const order = await this.orderRepo.findOne({
          where: {
            id: Number(selectedOrderId),
            business: { id: businessId }
          },
          relations: ['customer'] // <--- important
        });

        if (!order || order.customer?.phone !== phone) {
          await client.sendMessage(
            phone,
            `❌ Order #${selectedOrderId} was not found.\nPlease enter a correct order ID.\n\n➡️ Type 0 to go back.`
          );
          return;
        }

        // ---- Save selected order & go to upload step ----
        stateData.orderId = Number(selectedOrderId);
        stateData.customer = {
          id: order.customer.id, // now this will be populated
          phone: order.customer.phone
        };

        await this.saveUserState(
          businessId,
          phone,
          name,
          stateData,
          'upload_payment_receipt'
        );

        // Ask for the receipt image
        await client.sendMessage(
          phone,
          `📤 *Upload Receipt* \nPlease send the payment receipt image for *Order #${selectedOrderId}*.`
        );
      }
        break;

      default:
        await client.sendMessage(
          phone,
          "🤖 මට තේරුණේ නෑ 😅 Type 'hi' නැත්නම් '0' කියලා start කරන්න."
        );
    }
  }



  private async sendLanguageSelection(client: Client, phone: string) {
    const msg = `🌐 Please select your language / භාෂාව තෝරන්න / மொழியை தேர்ந்தெடுக்கவும்:\n\n1️⃣ English\n2️⃣ සිංහල\n3️⃣ தமிழ்`;
    await client.sendMessage(phone, msg);
  }


  // ==============================
  // Restore previous state
  // ==============================
  private async restorePreviousState(
    client: Client,
    businessId: number,
    phone: string,
    name: string,
    business: Business,
    prevState: string
  ) {
    const userState = await this.userStateRepo.findOne({ where: { phone, business_id: businessId } });
    const stateData = userState?.last_message ? JSON.parse(userState.last_message) : {};
    const language = userState?.language || 'en';

    switch (prevState) {
      case 'main_menu':
        await this.sendMainMenu(client, phone, businessId, business.name, language);
        break;

      // ===== Place Order states =====
      case 'place_order':
      case 'category_selection':
        await showCategories(client, phone, businessId, language, this.businessRepo, this.botMessageRepo);
        break;
      case 'subcategory_selection':
        if (stateData.categoryId) await selectSubCategory(client, phone, business, stateData.categoryId, language, this.botMessageRepo);
        break;
      case 'subsub_category_selection':
        if (stateData.subCategoryId) {
          await selectSubSubCategory(client, phone, business, stateData.subCategoryId, language, this.botMessageRepo);
        } else {
          await selectSubCategory(client, phone, business, stateData.categoryId, language, this.botMessageRepo);
        }
        break;
      case 'product_selection':
        if (stateData.subSubId) await sendProductsList(client, phone, business, stateData.subSubId, stateData.subCategoryId, language, this.botMessageRepo);
        break;
      case 'variant_selection':
        if (stateData.productId) await sendVariantsList(client, phone, business, stateData.productId, businessId, stateData, this.saveUserState.bind(this), this.productRepo, this.botMessageRepo, language);
        break;
      case 'quantity_input':
        if (stateData.variantId) {
          await sendVariantsList(client, phone, business, stateData.productId, businessId, stateData, this.saveUserState.bind(this), this.productRepo, this.botMessageRepo, language);
        }
        break;
      case 'confirm_order':
        await confirmOrder(client, phone, '', stateData, businessId, language, this.saveUserState.bind(this), this.businessPaymentOptionRepo, this.botMessageRepo);
        break;
      case 'select_payment_method':
        await handlePaymentMethod(client, phone, '', stateData, businessId, language, this.saveUserState.bind(this), this.orderRepo, this.orderItemRepo, this.variantRepo, this.businessPaymentOptionRepo, this.deliveryFeeRepo, this.botMessageRepo);
        break;
      case 'upload_payment_receipt':
        await handlePaymentReceipt(client, null, phone, stateData, businessId, language, this.saveUserState.bind(this), this.orderRepo, this.botMessageRepo);
        break;

      // ===== My Orders states =====
      case 'order_history_menu':
        await import('./messages-flows/my-orders/order-history-menu.flow').then(m =>
          m.showOrderHistoryMenu(client, phone)
        );
        break;
      case 'pending_orders':
      case 'confirmed_orders':
      case 'paid_orders':
      case 'shipped_orders':
      case 'delivered_orders':
      case 'canceled_orders':
      case 'refunded_orders':
        await this.handleOrderHistoryMenu(client, phone, name, businessId, '', language);
        break;
      case 'select_receipt_option':

        // select_receipt_option menu එක show කරන්න 
        await client.sendMessage(
          phone,
          "📄 *Upload Payment Receipt*\n\nSelect an option:\n\n" +
          "1️⃣ Upload for existing Order\n" +
          "2️⃣ Other / Help\n\n" +
          "➡️ Type 0 to go back."
        );

        break;


      default:
        await this.sendMainMenu(client, phone, businessId, business.name, language);
    }

    // Always update the user state
    await this.saveUserState(businessId, phone, name, stateData, prevState);
  }


  // ==============================
  // Main menu
  // ==============================
  private async sendMainMenu(
    client: Client,
    phone: string,
    businessId: number,
    businessName: string,
    language: string
  ) {
    const msgRow = await this.botMessageRepo.findOne({
      where: { business_id: businessId, language, key_name: 'main_menu' },
    });

    let msg = msgRow?.text || `👋 Hello! I am ${businessName} bot 🤖

1️⃣ Business Details  
2️⃣ My Orders  
3️⃣ Place Order
4️⃣ Change Language
5️⃣ Upload Payment Receipt
6️⃣ Customer Service (Live Chat) 

➡️ Go Back: Type 0`;

    // Replace placeholder
    msg = msg.replace('{businessName}', businessName);

    await client.sendMessage(phone, msg);
  }


  private async handleMainMenu(
    client: Client,
    phone: string,
    name: string,
    businessId: number,
    text: string,
    language: string
  ) {
    switch (text) {
      case '1':
        // Instead of delivery info, send full business info 
        await this.sendBusinessFullInfo(client, phone, businessId);
        await this.saveUserState(businessId, phone, name, {}, 'business_info');
        break;
      case '2': // ⭐ NEW — My Orders
        await import('./messages-flows/my-orders/order-history-menu.flow').then(m =>
          m.showOrderHistoryMenu(client, phone)
        );
        await this.saveUserState(businessId, phone, name, {}, 'order_history_menu');
        break;
      case '3':
        await showCategories(client, phone, businessId, language, this.businessRepo, this.botMessageRepo);
        await this.saveUserState(businessId, phone, name, {}, 'place_order');
        break;
      case '4':
        await this.sendLanguageSelection(client, phone);
        await this.saveUserState(businessId, phone, name, {}, 'language_selection');
        break;
      case '5':

        await client.sendMessage(
          phone,
          "📄 *Upload Payment Receipt*\n\nSelect an option:\n\n" +
          "1️⃣ Upload for existing Order\n" +
          "2️⃣ Other / Help\n\n" +
          "➡️ Type 0 to go back."
        );

        await this.saveUserState(businessId, phone, name, {}, 'select_receipt_option');
        return;

      case '6':
        await client.sendMessage(
          phone,
          "💬 *You are now connected to Customer Service!*\n\n" +
          "Send your message here. A staff member will reply soon.\n\n" +
          "➡️ Type *menu* anytime to return to the bot."
        );

        await this.saveUserState(
          businessId,
          phone,
          name,
          { enteredAt: Date.now() },  // record the entry time
          'customer_service_mode'
        );


        break;


      default:
        await client.sendMessage(phone, '❌ Invalid option. Type 1, 2, or 3.');
    }
  }

  private async sendBusinessFullInfo(client: Client, phone: string, businessId: number) {
    const business = await this.businessRepo.findOne({
      where: { id: businessId },
      relations: ['owner', 'categories', 'customers', 'subscriptions', 'orders'],
    });

    if (!business) {
      await client.sendMessage(phone, '❌ Business info not found.');
      return;
    }

    const msg = `🏢 *Business Details:*\n\n` +
      `*Name:* ${business.name}\n` +
      `*Email:* ${business.email}\n` +
      `*Phone:* ${business.phone}\n` +
      `*Address:* ${business.address}\n` +
      `*Active:* ${business.is_active ? 'Yes ✅' : 'No ❌'}\n\n` +
      `➡️ Go Back: Type 0`;

    await client.sendMessage(phone, msg);
  }


  // ==============================
  // My Order Flow
  // ==============================
  // ==============================
  private async handleOrderHistoryMenu(
    client: Client,
    phone: string,
    name: string,
    businessId: number,
    text: string,
    language: string
  ) {
    switch (text) {
      case '1': // Pending
        await import('./messages-flows/my-orders/list-orders.flow').then(m =>
          m.sendOrdersByStatus(client, phone, businessId, this.orderRepo, phone, 'pending', this.saveUserState.bind(this), name, language, this.orderCancellationRepo)
        );
        break;

      case '2': // Confirmed
        await import('./messages-flows/my-orders/list-orders.flow').then(m =>
          m.sendOrdersByStatus(client, phone, businessId, this.orderRepo, phone, 'confirmed', this.saveUserState.bind(this), name, language, this.orderCancellationRepo)
        );
        break;

      case '3': // Paid
        await import('./messages-flows/my-orders/list-orders.flow').then(m =>
          m.sendOrdersByStatus(client, phone, businessId, this.orderRepo, phone, 'paid', this.saveUserState.bind(this), name, language, this.orderCancellationRepo)
        );
        break;

      case '4': // Shipped
        await import('./messages-flows/my-orders/list-orders.flow').then(m =>
          m.sendOrdersByStatus(client, phone, businessId, this.orderRepo, phone, 'shipped', this.saveUserState.bind(this), name, language, this.orderCancellationRepo)
        );
        break;

      case '5': // Delivered
        await import('./messages-flows/my-orders/list-orders.flow').then(m =>
          m.sendOrdersByStatus(client, phone, businessId, this.orderRepo, phone, 'delivered', this.saveUserState.bind(this), name, language, this.orderCancellationRepo)
        );
        break;

      case '6': // Canceled
        await import('./messages-flows/my-orders/list-orders.flow').then(m =>
          m.sendOrdersByStatus(client, phone, businessId, this.orderRepo, phone, 'canceled', this.saveUserState.bind(this), name, language, this.orderCancellationRepo)
        );
        break;

      case '7': // Refunded
        await import('./messages-flows/my-orders/list-orders.flow').then(m =>
          m.sendOrdersByStatus(client, phone, businessId, this.orderRepo, phone, 'refunded', this.saveUserState.bind(this), name, language, this.orderCancellationRepo)
        );
        break;

      case '0': // Back to main menu
        await this.sendMainMenu(client, phone, businessId, 'Business', language);
        await this.saveUserState(businessId, phone, '', {}, 'main_menu', language);
        return;

      default:
        await client.sendMessage(phone, '❌ Invalid option. Enter a number from 0 to 7.');
    }
  }


  // ==============================
  // Place Order Flow
  // ==============================
  // ==============================
  private async handlePlaceOrder(
    client: Client,
    phone: string,
    businessId: number,
    text: string,
    state: string,
    language: string
  ) {
    const business = await this.businessRepo.findOne({
      where: { id: businessId },
      relations: [
        'categories',
        'categories.subcategories',
        'categories.subcategories.products',
        'categories.subcategories.products.variants',
        'categories.subcategories.products.variants.images',
        'categories.subcategories.products.subsubCategory',
        'categories.subcategories.subsubcategories',
        'categories.subcategories.subsubcategories.products',
        'categories.subcategories.subsubcategories.products.variants',
        'categories.subcategories.subsubcategories.products.variants.images',
        'categories.subcategories.products.subCategory'
      ],
    });

    if (!business) return;

    const userState = await this.userStateRepo.findOne({
      where: { phone, business_id: businessId }
    });

    let stateData = userState?.last_message ? JSON.parse(userState.last_message) : {};

    // ✅ BACK (0)
    if (text === '0') {
      switch (state) {
        case 'place_order':
        case 'category_selection':
          stateData = {};
          await this.sendMainMenu(client, phone, businessId, business.name, language);
          await this.saveUserState(businessId, phone, '', {}, 'main_menu');
          return;

        case 'subcategory_selection':
          stateData = {};
          await showCategories(client, phone, businessId, language, this.businessRepo, this.botMessageRepo);
          await this.saveUserState(businessId, phone, '', stateData, 'category_selection');
          return;

        case 'subsub_category_selection':
          delete stateData.subCategoryId;
          delete stateData.subSubId;
          delete stateData.productId;
          delete stateData.variantId;
          await selectSubCategory(client, phone, business, stateData.categoryId, language, this.botMessageRepo);
          await this.saveUserState(businessId, phone, '', stateData, 'subcategory_selection');
          return;

        case 'product_selection':
          delete stateData.subSubId;
          delete stateData.productId;
          delete stateData.variantId;
          await selectSubSubCategory(client, phone, business, stateData.subCategoryId, language, this.botMessageRepo);
          await this.saveUserState(businessId, phone, '', stateData, 'subsub_category_selection');
          return;

        case 'variant_selection':
          delete stateData.productId;
          delete stateData.variantId;

          if (stateData.subSubId === 0) {
            await sendProductsList(client, phone, business, 0, stateData.subCategoryId, language, this.botMessageRepo);
          } else {
            await sendProductsList(client, phone, business, stateData.subSubId, stateData.subCategoryId, language, this.botMessageRepo);
          }

          await this.saveUserState(businessId, phone, '', stateData, 'product_selection');
          return;

        case 'quantity_input':
          delete stateData.variantId;
          await sendVariantsList(client, phone, business, stateData.productId, business.id, stateData, this.saveUserState.bind(this), this.productRepo, this.botMessageRepo, language);
          await this.saveUserState(businessId, phone, '', stateData, 'variant_selection');
          return;
      }
    }

    // ✅ FORWARD FLOW
    switch (state) {

      case 'place_order':
      case 'category_selection':
        stateData.categoryId = parseInt(text);
        await selectSubCategory(client, phone, business, stateData.categoryId, language, this.botMessageRepo);
        await this.saveUserState(businessId, phone, '', stateData, 'subcategory_selection');
        break;

      case 'subcategory_selection':
        const category = business.categories.find(c => c.id === stateData.categoryId);
        const subcategories = category?.subcategories || [];

        const selectedSub = subcategories[parseInt(text) - 1];
        if (!selectedSub) {
          await client.sendMessage(phone, "❌ Invalid selection. Enter a valid number.");
          return;
        }

        stateData.subCategoryId = selectedSub.id;

        await selectSubSubCategory(client, phone, business, stateData.subCategoryId, language, this.botMessageRepo);
        await this.saveUserState(businessId, phone, '', stateData, 'subsub_category_selection');
        break;

      case 'subsub_category_selection':
        const subcategory = business.categories
          .find(c => c.id === stateData.categoryId)
          ?.subcategories.find(sc => sc.id === stateData.subCategoryId);

        const subSubcategories = subcategory?.subsubcategories || [];
        const directProducts = (subcategory?.products || []).filter(p => !p.subsubCategory && p.is_active);

        const choice = text.trim().toUpperCase();

        // ✅ A = Direct Products
        if (choice === 'A' && directProducts.length > 0) {
          await sendProductsList(client, phone, business, 0, subcategory!.id, language, this.botMessageRepo);
          stateData.subSubId = 0;
          await this.saveUserState(businessId, phone, '', stateData, 'product_selection');
          return;
        }

        const selectedSubSub = subSubcategories[parseInt(choice) - 1];
        if (!selectedSubSub) {
          await client.sendMessage(phone, "❌ Invalid selection. Type again.");
          return;
        }

        const activeProducts = (selectedSubSub.products || []).filter(p => p.is_active);

        if (!activeProducts.length) {
          await client.sendMessage(phone, "😅 No products here. Select another.");
          return;
        }

        stateData.subSubId = selectedSubSub.id;
        await sendProductsList(client, phone, business, stateData.subSubId, stateData.subCategoryId, language, this.botMessageRepo);

        await this.saveUserState(businessId, phone, '', stateData, 'product_selection');
        break;

      case 'product_selection':
        await handleProductSelection(client, phone, business, stateData, parseInt(text), this.saveUserState.bind(this), this.productRepo, this.botMessageRepo, language);
        break;

      case 'variant_selection':
        await handleVariantSelection(client, phone, business, stateData, parseInt(text), businessId, this.saveUserState.bind(this), this.botMessageRepo, language);
        break;

      case 'quantity_input':
        await handleQuantityInput(client, phone, business, stateData, text, businessId, this.saveUserState.bind(this), this.productRepo, this.botMessageRepo, language);
        break;
      case 'enter_customer_details':
      case 'collect_customer_name':
      case 'collect_customer_address':
      case 'collect_customer_phone':
        await handleCustomerDetails(client, phone, text, state, stateData, businessId, language, this.saveUserState.bind(this), this.customerRepo, this.variantRepo, this.botMessageRepo);
        break;

      case 'confirm_order':
        await confirmOrder(client, phone, text, stateData, businessId, language, this.saveUserState.bind(this), this.businessPaymentOptionRepo, this.botMessageRepo);
        break;

    }
  }


  // ==============================
  // Save state helper
  // ==============================
  private async saveUserState(
    businessId: number,
    phone: string,
    name: string,
    lastMessage: any,
    state: string,
    language?: string,
    previousState?: string
  ) {
    let userState = await this.userStateRepo.findOne({ where: { phone, business_id: businessId } });
    if (!userState) {
      userState = this.userStateRepo.create({ business_id: businessId, phone, name });
    }

    userState.previous_state = previousState ?? userState.state ?? 'main_menu';
    userState.state = state;
    userState.last_message = JSON.stringify(lastMessage || {});
    if (language) userState.language = language;

    await this.userStateRepo.save(userState);
  }


}
