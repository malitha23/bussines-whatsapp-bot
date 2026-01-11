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
import { showUploadReceiptMenu } from './messages-flows/upload-payment-receipt/upload-receipt-menu.flow';
import { selectOrderForReceiptUpload } from './messages-flows/upload-payment-receipt/select-order-for-receipt-upload.flow';
import { getBotMessage } from '../helpers/getBotMessage';
import { showOrderHistoryMenu } from './messages-flows/my-orders/order-history-menu.flow';
import { QuickStatsGateway } from '../../../gateway/quick-stats.gateway';
import { GptService } from '../gpt.service';
import { GptBytezService } from '../gpt-bytez.service';

@Injectable()
export class WhatsAppMessageHandler {
  private conversationHistory = new Map<string, Array<{ role: 'user' | 'assistant', content: string }>>();

  constructor(
    private readonly gptService: GptService,
    private readonly bytezService: GptBytezService,
    @InjectRepository(UserState)
    private readonly userStateRepo: Repository<UserState>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly messagesService: MessagesService,
    private readonly quickStatsGateway: QuickStatsGateway,
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
  // Main handler with AI support
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

    // If in customer service mode, handle with AI
    if (state === 'customer_service_mode') {
      const lastMessageData = userState?.last_message ? JSON.parse(userState.last_message) : {};
      const enteredAt = lastMessageData.enteredAt || null;

      // Calculate hours passed
      const hoursPassed = enteredAt ? (Date.now() - enteredAt) / (1000 * 60 * 60) : null;

      // Auto exit after 24 hours
      if (hoursPassed && hoursPassed > 24) {
        const messageText = await getBotMessage(this.botMessageRepo, businessId, language, 'customer_service_expired');
        await client.sendMessage(phone, messageText);

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

      // Handle with AI conversation
      await this.handleAIConversation(client, phone, text, businessId, name, language, state);
      return;
    }

    // === Check if user needs AI assistance ===
    const customerStates = [
      'collect_customer_name',
      'collect_customer_address',
      'collect_customer_email',
      'collect_customer_phone'
    ];

    if (!customerStates.includes(state)) {
      const shouldUseAI = await this.shouldUseAIForMessage(text, state, language);
      if (shouldUseAI) {
        await this.handleAIConversation(client, phone, text, businessId, name, language, state);
        await this.sendMainMenu(client, phone, businessId, business.name, language);
        await this.saveUserState(businessId, phone, name, {}, 'main_menu', language);
        return;
      }
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
      'confirm_order',
      'select_payment_method',
      'upload_payment_receipt',
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

        // Special handling for subsub_category_selection
        if (state === 'subsub_category_selection') {

          const stateData = userState?.last_message ? JSON.parse(userState.last_message) : {};
          await this.handleSubCategorySelectionBack(
            client, businessId, phone, name, business, stateData, language
          );
        } else {
          await this.restorePreviousState(client, businessId, phone, name, business, prevState);
        }
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
        await this.sendLanguageSelection(client, phone);
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
          await this.sendMainMenu(client, phone, businessId, business.name, language);
          await this.saveUserState(businessId, phone, name, {}, 'main_menu');
        } else {
          const messageText = await getBotMessage(this.botMessageRepo, businessId, language, 'invalid_input_main_menu');
          await client.sendMessage(phone, messageText);
        }
        break;

      case 'order_history_menu':
        await this.handleOrderHistoryMenu(client, phone, name, businessId, cleanText, language);
        break;

      case 'awaiting_order_cancellation':
        await startCancellationFlow(client, phone, cleanText, businessId, name, this.saveUserState.bind(this), this.orderRepo, this.botMessageRepo, language, this.orderCancellationRepo);
        break;

      case 'awaiting_cancellation_reason':
        await handleCancellationResponse(client, phone, cleanText, businessId, name, this.saveUserState.bind(this), this.userStateRepo, this.botMessageRepo, language);
        break;

      case 'enter_cancellation_reason':
        await enterCancellationReason(client, phone, text, businessId, name, this.saveUserState.bind(this), this.userStateRepo, this.orderRepo, this.orderCancellationRepo, this.botMessageRepo, language, this.quickStatsGateway);
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

      case 'confirm_order':
        {
          const userState = await this.userStateRepo.findOne({ where: { phone, business_id: businessId } });
          const stateData: any = userState?.last_message ? JSON.parse(userState.last_message) : {};
          await confirmOrder(client, phone, text, stateData, businessId, language, this.saveUserState.bind(this), this.businessPaymentOptionRepo, this.botMessageRepo);
        }
        break;

      case 'select_payment_method':
        {
          const userState = await this.userStateRepo.findOne({ where: { phone, business_id: businessId } });
          const stateData: any = userState?.last_message ? JSON.parse(userState.last_message) : {};
          await handlePaymentMethod(client, phone, text, stateData, businessId, language, this.saveUserState.bind(this), this.orderRepo, this.orderItemRepo, this.variantRepo, this.businessPaymentOptionRepo, this.deliveryFeeRepo, this.botMessageRepo, this.quickStatsGateway);
        }
        break;

      case 'upload_payment_receipt':
        {
          const userState = await this.userStateRepo.findOne({ where: { phone, business_id: businessId } });
          const stateData: any = userState?.last_message ? JSON.parse(userState.last_message) : {};
          await handlePaymentReceipt(
            client,
            text,
            phone,
            stateData,
            businessId,
            language,
            this.saveUserState.bind(this),
            this.orderRepo,
            this.botMessageRepo,
            this.quickStatsGateway
          );
        }
        break;

      case 'post_payment':
        if (cleanText === '0') {
          await this.sendMainMenu(client, phone, businessId, business.name, language);
          await this.saveUserState(businessId, phone, name, {}, 'main_menu');
        } else {
          const msg = await getBotMessage(this.botMessageRepo, businessId, language, 'return_main_menu');
          await client.sendMessage(phone, msg);
        }
        break;

      case 'select_receipt_option':
        if (cleanText === '0') {
          await this.sendMainMenu(client, phone, businessId, business.name, language);
          await this.saveUserState(businessId, phone, name, {}, 'main_menu');
          return;
        }
        await handleUploadPaymentReceipt(
          client,
          phone,
          businessId,
          name,
          cleanText,
          language,
          this.saveUserState.bind(this),
          this.sendMainMenu.bind(this),
          this.orderRepo,
          this.botMessageRepo
        );
        break;

      case 'select_order_for_receipt_upload':
        await selectOrderForReceiptUpload(
          client,
          phone,
          businessId,
          name,
          cleanText,
          language,
          this.saveUserState.bind(this),
          this.orderRepo,
          this.botMessageRepo,
          handleUploadPaymentReceipt.bind(this),
          this.sendMainMenu.bind(this)
        );
        break;

      default:
        // If we don't recognize the state, use AI to handle
        await this.handleAIConversation(client, phone, text, businessId, name, language, state);
    }
  }

  // ==============================
  // AI Conversation Handler
  // ==============================
  private async handleAIConversation(
    client: Client,
    phone: string,
    text: string,
    businessId: number,
    name: string,
    language: string,
    currentState: string
  ) {
    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business) return;

    // Get or initialize conversation history
    if (!this.conversationHistory.has(phone)) {
      this.conversationHistory.set(phone, []);
    }
    const history = this.conversationHistory.get(phone) || [];

    // Prepare business info context
    const businessInfo = `Business: ${business.name}. Services: Ordering, Payment, Customer Support.`;

    // Call AI service
    const result = await this.bytezService.handleUserMessage(
      text,
      {
        businessName: business.name,
        currentState: currentState,
        conversationHistory: history.slice(-5), // Last 5 messages
        businessInfo: businessInfo
      },
      language as 'en' | 'si' | 'ta',
      { maxTokens: 300, temperature: 0.7 }
    );

    // Update conversation history
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: result.response });

    // Keep only last 10 messages
    if (history.length > 10) {
      this.conversationHistory.set(phone, history.slice(-10));
    } else {
      this.conversationHistory.set(phone, history);
    }

    // Send AI response
    await client.sendMessage(phone, result.response);

    // If AI suggests an action, handle it
    if (!result.shouldContinue && result.suggestedAction) {
      await this.handleAISuggestedAction(
        client,
        phone,
        businessId,
        name,
        language,
        result.suggestedAction
      );
    }

    // If in customer service mode, save state
    if (currentState === 'customer_service_mode') {
      await this.saveUserState(
        businessId,
        phone,
        name,
        { enteredAt: Date.now(), conversationHistory: history },
        'customer_service_mode',
        language
      );
    }
  }

  // ==============================
  // AI Suggested Action Handler
  // ==============================
  private async handleAISuggestedAction(
    client: Client,
    phone: string,
    businessId: number,
    name: string,
    language: string,
    suggestedAction: string
  ) {
    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business) return;

    switch (suggestedAction) {
      case 'main_menu':
        await this.sendMainMenu(client, phone, businessId, business.name, language);
        await this.saveUserState(businessId, phone, name, {}, 'main_menu', language);
        break;

      case 'place_order':
        await showCategories(client, phone, businessId, language, this.businessRepo, this.botMessageRepo);
        await this.saveUserState(businessId, phone, name, {}, 'place_order', language);
        break;

      case 'business_info':
        await this.sendBusinessFullInfo(client, phone, businessId, language);
        await this.saveUserState(businessId, phone, name, {}, 'business_info', language);
        break;

      case 'order_history':
        await showOrderHistoryMenu(client, phone, language, businessId, this.botMessageRepo);
        await this.saveUserState(businessId, phone, name, {}, 'order_history_menu', language);
        break;

      case 'customer_service':
        const msg = await getBotMessage(this.botMessageRepo, businessId, language, 'customer_service_connected');
        await client.sendMessage(phone, msg);
        await this.saveUserState(
          businessId,
          phone,
          name,
          { enteredAt: Date.now() },
          'customer_service_mode',
          language
        );
        break;

      default:
        // Default to main menu
        await this.sendMainMenu(client, phone, businessId, business.name, language);
        await this.saveUserState(businessId, phone, name, {}, 'main_menu', language);
    }
  }

  // ==============================
  // Check if message needs AI handling
  // ==============================
  private async shouldUseAIForMessage(
    text: string,
    currentState: string,
    language: string
  ): Promise<boolean> {
    const textLower = text.toLowerCase().trim();

    // Always use AI for these states
    if (currentState === 'customer_service_mode') {
      return true;
    }

    // Check for natural language queries
    const aiKeywords = [
      // Questions
      'what', 'how', 'when', 'where', 'why', 'who', 'which',
      'can you', 'could you', 'would you', 'will you',
      'tell me', 'explain', 'show me', 'help',

      // Greetings and small talk
      'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
      'how are you', 'how\'s it going', 'what\'s up',

      // General inquiries
      'about', 'information', 'details', 'price', 'cost', 'delivery',
      'shipping', 'payment', 'order status', 'track', 'return', 'refund',

      // Complaints/feedback
      'problem', 'issue', 'error', 'wrong', 'not working', 'complaint',
      'feedback', 'suggestion', 'improve'
    ];

    // Check if message contains AI keywords
    const hasAIKeyword = aiKeywords.some(keyword =>
      textLower.includes(keyword.toLowerCase())
    );

    // Check if it's a natural language query (not menu selection)
    const isNumberSelection = /^\d+$/.test(textLower);
    const isMenuOption = textLower === '0' || textLower === 'menu' ||
      textLower === 'hi' || textLower === 'hello';

    // Use AI if:
    // 1. Has AI keywords AND not a menu selection
    // 2. Is a question (ends with ?)
    // 3. Is a complex sentence (more than 3 words)
    const isQuestion = textLower.endsWith('?');
    const wordCount = textLower.split(/\s+/).length;
    const isComplexSentence = wordCount > 3;

    return (hasAIKeyword && !isNumberSelection && !isMenuOption) ||
      isQuestion ||
      isComplexSentence;
  }

  // ==============================
  // Helper Methods (keep existing)
  // ==============================
  private async sendLanguageSelection(client: Client, phone: string) {
    const msg = `🌐 Please select your language / භාෂාව තෝරන්න / மொழியை தேர்ந்தெடுக்கவும்:\n\n1️⃣ English\n2️⃣ සිංහල\n3️⃣ தமிழ்`;
    await client.sendMessage(phone, msg);
  }

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

      case 'place_order':
      case 'category_selection':
        await showCategories(client, phone, businessId, language, this.businessRepo, this.botMessageRepo);
        break;

      case 'subcategory_selection':
        if (stateData.categoryId) {
          const categories = business.categories || [];
          const categoryIndex = categories.findIndex(c => c.id === stateData.categoryId) + 1;
          if (categoryIndex > 0) {
            await selectSubCategory(client, phone, business, categoryIndex, language, this.botMessageRepo);
          } else {
            await showCategories(client, phone, businessId, language, this.businessRepo, this.botMessageRepo);
          }
        } else {
          await showCategories(client, phone, businessId, language, this.businessRepo, this.botMessageRepo);
        }
        break;

      case 'subsub_category_selection':
        if (stateData.subCategoryId) {
          const businessWithRelations = await this.businessRepo.findOne({
            where: { id: businessId },
            relations: [
              'categories',
              'categories.subcategories',
              'categories.subcategories.subsubcategories',
              'categories.subcategories.products',
              'categories.subcategories.products.subsubCategory',
            ],
          });

          if (businessWithRelations) {
            await selectSubSubCategory(
              client,
              phone,
              businessWithRelations,
              stateData.subCategoryId,
              language,
              this.botMessageRepo
            );
          } else {
            await showCategories(client, phone, businessId, language, this.businessRepo, this.botMessageRepo);
          }
        } else if (stateData.categoryId) {
          const categories = business.categories || [];
          const categoryIndex = categories.findIndex(c => c.id === stateData.categoryId) + 1;
          if (categoryIndex > 0) {
            await selectSubCategory(client, phone, business, categoryIndex, language, this.botMessageRepo);
            await this.saveUserState(businessId, phone, name, stateData, 'subcategory_selection');
            return;
          }
        } else {
          await showCategories(client, phone, businessId, language, this.businessRepo, this.botMessageRepo);
        }
        break;

      // case 'product_selection':
      //   if (stateData.subSubId) await sendProductsList(client, phone, business, stateData.subSubId, stateData.subCategoryId, language, this.botMessageRepo);

      //   break;

      // case 'variant_selection':
      //   if (stateData.productId) await sendVariantsList(client, phone, business, stateData.productId, businessId, stateData, this.saveUserState.bind(this), this.productRepo, this.botMessageRepo, language);
      //   break;

      // case 'quantity_input':
      //   if (stateData.variantId) {
      //     await sendVariantsList(client, phone, business, stateData.productId, businessId, stateData, this.saveUserState.bind(this), this.productRepo, this.botMessageRepo, language);
      //   }
      //   break; 

      case 'confirm_order':
        await confirmOrder(client, phone, '', stateData, businessId, language, this.saveUserState.bind(this), this.businessPaymentOptionRepo, this.botMessageRepo);
        break;

      case 'select_payment_method':
        await handlePaymentMethod(client, phone, '', stateData, businessId, language, this.saveUserState.bind(this), this.orderRepo, this.orderItemRepo, this.variantRepo, this.businessPaymentOptionRepo, this.deliveryFeeRepo, this.botMessageRepo, this.quickStatsGateway);
        break;

      case 'upload_payment_receipt':
        await handlePaymentReceipt(client, null, phone, stateData, businessId, language, this.saveUserState.bind(this), this.orderRepo, this.botMessageRepo, this.quickStatsGateway);
        break;

      case 'order_history_menu':
        await showOrderHistoryMenu(client, phone, language, businessId, this.botMessageRepo);
        break;

      case 'pending_orders':
      case 'confirmed_orders':
      case 'paid_orders':
      case 'shipped_orders':
      case 'delivered_orders':
      case 'canceled_orders':
      case 'refunded_orders':
        await showOrderHistoryMenu(client, phone, language, businessId, this.botMessageRepo);
        break;

      case 'select_receipt_option':
        await showUploadReceiptMenu(client, phone, language, businessId, this.botMessageRepo);
        break;

      case 'select_order_for_receipt_upload':
        await this.sendMainMenu(client, phone, businessId, business.name, language);
        await this.saveUserState(businessId, phone, name, {}, 'main_menu', language);
        break;

      default:
        await this.sendMainMenu(client, phone, businessId, business.name, language);
        await this.saveUserState(businessId, phone, name, {}, 'main_menu', language, 'main_menu');
    }

    if (prevState !== 'select_order_for_receipt_upload') {
      await this.saveUserState(businessId, phone, name, stateData, prevState);
    }
  }

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

    let baseMessage = msgRow?.text || `👋 Hello! I am ${businessName} bot 🤖

1️⃣ Business Details  
2️⃣ My Orders  
3️⃣ Place Order
4️⃣ Change Language
5️⃣ Upload Payment Receipt
6️⃣ Customer Service (Live Chat)`;

    baseMessage = baseMessage.replace('{businessName}', businessName);

    const enhancedMessage = await this.bytezService.enhanceMessage(
      'Main menu options for WhatsApp bot',
      baseMessage,
      businessName,
      language as any,
      { maxTokens: 500, temperature: 0.5 }
    );

    await client.sendMessage(phone, enhancedMessage);
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
        await this.sendBusinessFullInfo(client, phone, businessId, language);
        await this.saveUserState(businessId, phone, name, {}, 'business_info');
        break;
      case '2':
        await showOrderHistoryMenu(client, phone, language, businessId, this.botMessageRepo);
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
        await showUploadReceiptMenu(client, phone, language, businessId, this.botMessageRepo);
        await this.saveUserState(businessId, phone, name, {}, 'select_receipt_option');
        return;
      case '6':
        const msg = await getBotMessage(this.botMessageRepo, businessId, language, 'customer_service_connected');
        await client.sendMessage(phone, msg);
        await this.saveUserState(
          businessId,
          phone,
          name,
          { enteredAt: Date.now() },
          'customer_service_mode',
          language
        );
        break;
      default:
        const errorMsg = await getBotMessage(this.botMessageRepo, businessId, language, 'invalid_option_1_2_3');
        await client.sendMessage(phone, errorMsg);
    }
  }

  private async sendBusinessFullInfo(client: Client, phone: string, businessId: number, language: string) {
    const business = await this.businessRepo.findOne({
      where: { id: businessId },
      relations: ['owner', 'categories', 'customers', 'subscriptions', 'orders'],
    });

    if (!business) {
      await client.sendMessage(phone, '❌ Business info not found.');
      return;
    }

    const businessDetails = {
      name: business.name,
      email: business.email,
      phone: business.phone,
      address: business.address,
      isActive: business.is_active,
    };

    const enhancedMessage = await this.bytezService.enhanceBusinessInfo(
      business.name,
      businessDetails,
      language as 'en' | 'si' | 'ta',
      { maxTokens: 600, temperature: 0.4 }
    );

    await client.sendMessage(phone, enhancedMessage);
  }

  private async handleOrderHistoryMenu(
    client: Client,
    phone: string,
    name: string,
    businessId: number,
    text: string,
    language: string
  ) {
    switch (text) {
      case '1':
        await import('./messages-flows/my-orders/list-orders.flow').then(m =>
          m.sendOrdersByStatus(client, phone, businessId, this.orderRepo, phone, 'pending', this.saveUserState.bind(this), name, language, this.orderCancellationRepo, this.botMessageRepo)
        );
        break;
      case '2':
        await import('./messages-flows/my-orders/list-orders.flow').then(m =>
          m.sendOrdersByStatus(client, phone, businessId, this.orderRepo, phone, 'confirmed', this.saveUserState.bind(this), name, language, this.orderCancellationRepo, this.botMessageRepo)
        );
        break;
      case '3':
        await import('./messages-flows/my-orders/list-orders.flow').then(m =>
          m.sendOrdersByStatus(client, phone, businessId, this.orderRepo, phone, 'paid', this.saveUserState.bind(this), name, language, this.orderCancellationRepo, this.botMessageRepo)
        );
        break;
      case '4':
        await import('./messages-flows/my-orders/list-orders.flow').then(m =>
          m.sendOrdersByStatus(client, phone, businessId, this.orderRepo, phone, 'shipped', this.saveUserState.bind(this), name, language, this.orderCancellationRepo, this.botMessageRepo)
        );
        break;
      case '5':
        await import('./messages-flows/my-orders/list-orders.flow').then(m =>
          m.sendOrdersByStatus(client, phone, businessId, this.orderRepo, phone, 'delivered', this.saveUserState.bind(this), name, language, this.orderCancellationRepo, this.botMessageRepo)
        );
        break;
      case '6':
        await import('./messages-flows/my-orders/list-orders.flow').then(m =>
          m.sendOrdersByStatus(client, phone, businessId, this.orderRepo, phone, 'canceled', this.saveUserState.bind(this), name, language, this.orderCancellationRepo, this.botMessageRepo)
        );
        break;
      case '7':
        await import('./messages-flows/my-orders/list-orders.flow').then(m =>
          m.sendOrdersByStatus(client, phone, businessId, this.orderRepo, phone, 'refunded', this.saveUserState.bind(this), name, language, this.orderCancellationRepo, this.botMessageRepo)
        );
        break;
      case '0':
        await this.sendMainMenu(client, phone, businessId, 'Business', language);
        await this.saveUserState(businessId, phone, '', {}, 'main_menu', language);
        return;
      default:
        await client.sendMessage(phone, '❌ Invalid option. Enter a number from 0 to 7.');
    }
  }

  // ==============================
  // Fixed handlePlaceOrder method
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
        'categories.subcategories.subsubcategories',
        'categories.subcategories.subsubcategories.products',
        'categories.subcategories.products',
        'categories.subcategories.products.variants',
        'categories.subcategories.products.variants.images',
        'categories.subcategories.products.subsubCategory',
        'categories.subcategories.products.subCategory',
        'categories.subcategories.subsubcategories.products.variants',
        'categories.subcategories.subsubcategories.products.variants.images',
      ],
    });

    if (!business) return;

    const userState = await this.userStateRepo.findOne({
      where: { phone, business_id: businessId }
    });

    let stateData = userState?.last_message ? JSON.parse(userState.last_message) : {};

    // Handle back navigation (0)
    // if (text === '0') {
    //   await this.handleBackNavigation(client, phone, businessId, business, state, stateData, language);
    //   return;
    // }

    // Handle forward flow
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
          await client.sendMessage(phone, "No products here. Select another.");
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

      default:
        console.warn(`Unhandled state in handlePlaceOrder: ${state}`);
    }
  }

  // ==============================
  // Fixed back navigation handler
  // ==============================
  private async handleBackNavigation(
    client: Client,
    phone: string,
    businessId: number,
    business: any,
    currentState: string,
    stateData: any,
    language: string
  ) {

    switch (currentState) {
      case 'place_order':
      case 'category_selection':
        // Clear all state data and go to main menu
        await this.saveUserState(businessId, phone, '', {}, 'main_menu');
        await this.sendMainMenu(client, phone, businessId, business.name, language);
        break;

      case 'subcategory_selection':
        // Clear subcategory data and go back to category selection
        delete stateData.categoryId;
        delete stateData.subCategoryId;
        delete stateData.subSubId;
        delete stateData.productId;
        delete stateData.variantId;

        await showCategories(client, phone, businessId, language, this.businessRepo, this.botMessageRepo);
        await this.saveUserState(businessId, phone, '', stateData, 'category_selection');
        break;

      case 'subsub_category_selection':
        // Clear sub-sub category data and go back to subcategory selection
        delete stateData.subSubId;
        delete stateData.productId;
        delete stateData.variantId;

        if (stateData.categoryId) {
          await selectSubCategory(client, phone, business, stateData.categoryId, language, this.botMessageRepo);
          await this.saveUserState(businessId, phone, '', stateData, 'subcategory_selection');
        } else {
          await showCategories(client, phone, businessId, language, this.businessRepo, this.botMessageRepo);
          await this.saveUserState(businessId, phone, '', stateData, 'category_selection');
        }
        break;

      case 'product_selection':
        // Clear product data and go back to subsub category selection
        delete stateData.productId;
        delete stateData.variantId;

        if (stateData.subSubId === 0) {
          // Direct products in subcategory
          await selectSubSubCategory(client, phone, business, stateData.subCategoryId, language, this.botMessageRepo);
          await this.saveUserState(businessId, phone, '', stateData, 'subsub_category_selection');
        } else if (stateData.subSubId) {
          await selectSubSubCategory(client, phone, business, stateData.subCategoryId, language, this.botMessageRepo);
          await this.saveUserState(businessId, phone, '', stateData, 'subsub_category_selection');
        } else {
          await selectSubCategory(client, phone, business, stateData.categoryId, language, this.botMessageRepo);
          await this.saveUserState(businessId, phone, '', stateData, 'subcategory_selection');
        }
        break;

      case 'variant_selection':
        // Clear variant data and go back to product selection
        delete stateData.variantId;

        if (stateData.subSubId === 0) {
          await sendProductsList(client, phone, business, 0, stateData.subCategoryId, language, this.botMessageRepo);
        } else {
          await sendProductsList(client, phone, business, stateData.subSubId, stateData.subCategoryId, language, this.botMessageRepo);
        }

        await this.saveUserState(businessId, phone, '', stateData, 'product_selection');
        break;

      case 'quantity_input':
        // Clear quantity data and go back to variant selection
        delete stateData.quantity;
        delete stateData.unit;

        await sendVariantsList(client, phone, business, stateData.productId, business.id, stateData, this.saveUserState.bind(this), this.productRepo, this.botMessageRepo, language);
        await this.saveUserState(businessId, phone, '', stateData, 'variant_selection');
        break;

      default:
        // Default fallback to main menu
        await this.saveUserState(businessId, phone, '', {}, 'main_menu');
        await this.sendMainMenu(client, phone, businessId, business.name, language);
    }
  }

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

    // Store previous state only if we're changing to a new state
    if (state !== userState.state) {
      userState.previous_state = userState.state || 'main_menu';
    }

    userState.state = state;
    userState.last_message = JSON.stringify(lastMessage || {});
    if (language) userState.language = language;

    await this.userStateRepo.save(userState);
  }

  private async handleSubCategorySelectionBack(
    client: Client,
    businessId: number,
    phone: string,
    name: string,
    business: Business,
    stateData: any,
    language: string
  ) {

    delete stateData.subSubId;
    delete stateData.productId;
    delete stateData.variantId;

    const categories = business.categories || [];
    const category = categories.find(c => c.id === stateData.categoryId);

    if (category) {
      const categoryIndex = categories.indexOf(category) + 1;
      if (categoryIndex > 0) {
        await selectSubCategory(client, phone, business, categoryIndex, language, this.botMessageRepo);
        await this.saveUserState(businessId, phone, name, stateData, 'subcategory_selection', language);
        return;
      }
    }

    await showCategories(client, phone, businessId, language, this.businessRepo, this.botMessageRepo);
    await this.saveUserState(businessId, phone, name, {}, 'category_selection', language);
  }

  // ==============================
  // Clean up conversation history
  // ==============================
  async clearConversationHistory(phone: string) {
    this.conversationHistory.delete(phone);
  }

  async getConversationHistory(phone: string) {
    return this.conversationHistory.get(phone) || [];
  }
}
