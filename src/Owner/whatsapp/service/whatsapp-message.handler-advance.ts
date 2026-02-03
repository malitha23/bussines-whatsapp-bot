// message-handler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';

import { BusinessSettings } from '../../../database/entities/business-settings.entity';
import { Business } from '../../../database/entities/business.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { InventoryTransaction } from '../../../database/entities/inventory-transaction.entity';
import { OrderItem } from '../../../database/entities/order-item.entity';
import { Order } from '../../../database/entities/order.entity';
import { ProductVariant } from '../../../database/entities/product-variant.entity';
import { GptBytezServiceAdvance } from '../advance-gpt-service';
import { Product } from '../../../database/entities/product.entity';

@Injectable()
export class MessageHandlerServiceAdvance {
  private readonly logger = new Logger(MessageHandlerServiceAdvance.name);

  constructor(
    @InjectRepository(Business)
    private businessRepo: Repository<Business>,
    @InjectRepository(Customer)
    private customerRepo: Repository<Customer>,
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    @InjectRepository(ProductVariant)
    private variantRepo: Repository<ProductVariant>,
    @InjectRepository(OrderItem)
    private orderItemRepo: Repository<OrderItem>,
    @InjectRepository(InventoryTransaction)
    private inventoryRepo: Repository<InventoryTransaction>,
    @InjectRepository(BusinessSettings)
    private settingsRepo: Repository<BusinessSettings>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    private readonly gptService: GptBytezServiceAdvance,
  ) { }

  async handleIncomingMessage(
    client: any,
    businessId: number,
    from: string,
    name: string,
    text: string,
    originalMsg: any
  ) {
    try {
      this.logger.log(`Processing message from ${from} for business ${businessId}: "${text}"`);

      // Clean phone number - IMPORTANT: WhatsApp Web needs exact format
      const phone = this.cleanPhoneNumber(from);

      // Get or create customer
      const customer = await this.getOrCreateCustomer(businessId, phone, name);
      try {
        await client.sendMessage('94774089929@c.us', text);
      } catch (err) {
        this.logger.error(`Failed to send message: ${err}`);
      }
      return;

     
      // Check if message is from business owner/manager/staff
      // const isStaff = await this.isBusinessStaff(businessId, phone);

      // if (isStaff) {
      //   this.logger.log(`Message from staff: ${phone}`);
      //   await this.handleStaffMessage(client, businessId, phone, text);
      //   return;
      // }

      // Handle customer message with AI
      await this.processCustomerMessage(client, businessId, customer, text, originalMsg);

    } catch (error) {
      this.logger.error(`Message handling error: ${error}`, error);

      // Try to send error message but don't crash if it fails
      try {
        if (from) {
          await client.sendMessage(from, "Sorry, I encountered an error. Please try again.");
        }
      } catch (sendError) {
        this.logger.error(`Failed to send error message: ${sendError}`);
      }
    }
  }

  private async processCustomerMessage(
    client: any,
    businessId: number,
    customer: Customer,
    text: string,
    originalMsg: any
  ) {
    try {
      // Get business settings
      const business = await this.businessRepo.findOne({
        where: { id: businessId },
        relations: ['settings']
      });

      if (!business) {
        this.logger.error(`Business ${businessId} not found`);
        return;
      }

      let settings: BusinessSettings | null = business.settings;

      if (!settings) {
        settings = await this.settingsRepo.findOne({
          where: { business: { id: businessId } }
        });
      }

      if (!settings) {
        throw new Error('Business settings not found');
      }


      // Check if auto-reply is enabled
      if (!settings?.auto_reply_enabled) {
        this.logger.log(`Auto-reply disabled for business ${businessId}`);
        return;
      }

      // Check business hours
      if (!this.isWithinBusinessHours(settings)) {
        if (settings.out_of_hours_auto_reply) {
          await this.sendMessageSafely(
            client,
            customer.phone,
            settings.out_of_hours_message || "We're currently closed. Our business hours are 9 AM to 5 PM."
          );
        }
        return;
      }

      // Process with AI
      const aiResponse = await this.gptService.processMessage(
        businessId,
        customer.phone,
        customer.name,
        text
      );

      // Handle different intents
      switch (aiResponse.intent) {
        case 'order_placement':
          await this.handleOrderPlacement(client, businessId, customer, text, aiResponse);
          break;

        case 'order_status':
          await this.handleOrderStatusInquiry(client, businessId, customer, text);
          break;

        case 'menu_request':
          await this.sendMenu(client, businessId, customer);
          break;

        case 'product_inquiry':
          await this.handleProductInquiry(client, businessId, customer, text, aiResponse);
          break;

        case 'greeting':
          await this.sendMessageSafely(
            client,
            customer.phone,
            aiResponse.response
          );
          break;

        default:
          await this.sendMessageSafely(
            client,
            customer.phone,
            aiResponse.response
          );

          // Suggest quick replies
          if (aiResponse.suggestedActions?.length) {
            await this.sendQuickReplies(client, customer.phone, aiResponse.suggestedActions);
          }
      }

      // Save message to database (optional)
      await this.saveCustomerMessage(customer, text, 'received', aiResponse.intent);

    } catch (error) {
      this.logger.error(`Error in processCustomerMessage: ${error}`, error);
    }
  }

  private async handleOrderPlacement(
    client: any,
    businessId: number,
    customer: Customer,
    message: string,
    aiResponse: any
  ) {
    try {
      // Extract order details using AI
      const extracted = await this.gptService.extractOrderDetails(businessId, message);

      if (extracted.items.length === 0) {
        // Ask for clarification
        await this.sendMessageSafely(
          client,
          customer.phone,
          "I couldn't understand what you'd like to order. Could you please specify? For example: '2 pizzas and 1 coke'"
        );
        return;
      }

      // Validate items and calculate total
      const { orderItems, totalAmount } = await this.validateAndCalculateOrder(
        businessId,
        extracted.items
      );

      if (orderItems.length === 0) {
        await this.sendMessageSafely(
          client,
          customer.phone,
          "Some items you mentioned aren't available. Please check our menu and try again."
        );
        return;
      }

      // Create order
      const order = this.orderRepo.create({
        business: { id: businessId },
        customer: customer,
        items: [],
        total_amount: totalAmount,
        delivery_fee: await this.calculateDeliveryFee(businessId, orderItems),
        status: 'pending',
        payment_status: 'pending',
        delivery_status: 'pending'
      });

      // Save order first to get ID
      const savedOrder = await this.orderRepo.save(order);

      // Create order items
      for (const item of orderItems) {
        const orderItem = this.orderItemRepo.create({
          order: savedOrder,
          variant: item.variant,
          quantity: item.quantity,
          price_per_unit: item.unitPrice,
          total_price: item.unitPrice * item.quantity
        });
        await this.orderItemRepo.save(orderItem);

        // Update inventory
        await this.updateInventory(item.variant.id, -item.quantity, 'OUT', `Order ${savedOrder.order_number}`);
      }

      // Get business for confirmation message
      const business = await this.businessRepo.findOne({
        where: { id: businessId }
      });

      // Send order confirmation
      const confirmation = `✅ Order Received!\n\nOrder #: ${savedOrder.order_number}\nTotal: $${savedOrder.total_amount.toFixed(2)}\nStatus: Processing\n\nWe'll notify you when your order is ready.`;

      await this.sendMessageSafely(
        client,
        customer.phone,
        confirmation
      );

      // Notify business staff
      await this.notifyStaff(client, businessId, savedOrder, customer);

    } catch (error) {
      this.logger.error(`Order placement error: ${error}`, error);

      await this.sendMessageSafely(
        client,
        customer.phone,
        "Sorry, there was an error processing your order. Please try again or contact support."
      );
    }
  }

  private async handleOrderStatusInquiry(
    client: any,
    businessId: number,
    customer: Customer,
    message: string
  ) {
    try {
      const statusCheck = await this.gptService.checkOrderStatus(businessId, customer.phone, message);
      await this.sendMessageSafely(
        client,
        customer.phone,
        statusCheck.response
      );
    } catch (error) {
      this.logger.error(`Order status inquiry error: ${error}`);

      await this.sendMessageSafely(
        client,
        customer.phone,
        "Sorry, I couldn't check your order status. Please provide your order number or try again later."
      );
    }
  }

  private async sendMenu(
    client: any,
    businessId: number,
    customer: Customer
  ) {
    try {
      // Get active products with variants
      const products = await this.productRepo
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.variants', 'variants')
        .where('product.business_id = :businessId', { businessId })
        .andWhere('product.is_active = true')
        .andWhere('variants.is_active = true')
        .orderBy('product.name', 'ASC')
        .getMany();

      if (products.length === 0) {
        await this.sendMessageSafely(
          client,
          customer.phone,
          "Our menu is currently being updated. Please check back later or contact us for available items."
        );
        return;
      }

      // Format menu message
      let menuMessage = `📋 *${customer.business.name} Menu*\n\n`;

      for (const product of products) {
        menuMessage += `*${product.name}*\n`;
        menuMessage += `${product.description || 'No description'}\n`;

        if (product.variants.length > 0) {
          for (const variant of product.variants) {
            menuMessage += `  • ${variant.variant_name}: $${variant.price} per ${variant.unit}\n`;
          }
        } else {
          menuMessage += `  • $${product.base_price}\n`;
        }
        menuMessage += '\n';
      }

      menuMessage += `\nTo order, just send: "I'd like to order [item name]"\n`;
      menuMessage += `Example: "2 large pizzas and 1 coke"`;

      await this.sendMessageSafely(
        client,
        customer.phone,
        menuMessage
      );
    } catch (error) {
      this.logger.error(`Error sending menu: ${error}`);

      await this.sendMessageSafely(
        client,
        customer.phone,
        "Sorry, I couldn't retrieve the menu. Please try again later."
      );
    }
  }

  private async handleProductInquiry(
    client: any,
    businessId: number,
    customer: Customer,
    query: string,
    aiResponse: any
  ) {
    try {
      const suggestions = await this.gptService.suggestProducts(businessId, query);

      await this.sendMessageSafely(
        client,
        customer.phone,
        suggestions.response
      );

      // If products found, offer to take order
      if (suggestions.products.length > 0) {
        const quickReply = "Would you like to order any of these? Just tell me what you want!";
        await this.sendMessageSafely(
          client,
          customer.phone,
          quickReply
        );
      }
    } catch (error) {
      this.logger.error(`Product inquiry error: ${error}`);

      await this.sendMessageSafely(
        client,
        customer.phone,
        "Sorry, I couldn't search for products. Please try again."
      );
    }
  }




  /**
   * Safe method to send messages with error handling
   */
  private getWhatsAppNumber(raw: string): string {
    if (!raw) throw new Error('Phone number empty');

    // Keep only digits and + sign
    let phone = raw.replace(/[^\d+]/g, '');

    // Add default Sri Lanka country code if missing
    if (!phone.startsWith('+')) phone = '+94' + phone;

    return `whatsapp:${phone}@c.us`;
  }

  // ========================
  // PHONE NUMBER HELPERS
  // ========================

  /**
   * Clean WhatsApp number: remove prefixes, suffixes, non-numeric chars
   */
  private cleanPhoneNumber(raw: string): string {
    if (!raw) return '';

    let phone = raw;

    // Remove whatsapp: prefix
    if (phone.startsWith('whatsapp:')) {
      phone = phone.substring(9);
    }

    // Remove @c.us suffix
    const atIndex = phone.indexOf('@');
    if (atIndex !== -1) {
      phone = phone.substring(0, atIndex);
    }

    // Remove all non-digit characters
    phone = phone.replace(/\D/g, '');

    this.logger.debug(`Cleaned phone from ${raw} to ${phone}`);
    return phone;
  }

  /**
   * Format Sri Lanka WhatsApp number for sending
   * Handles 0, 94, and +94 correctly
   */
  private formatSriLankaNumber(raw: string): string {
    let phone = raw;

    if (!phone) throw new Error('Phone number empty');

    // If number starts with 0 → replace with +94
    if (phone.startsWith('0')) {
      phone = '+94' + phone.slice(1);
    } else if (phone.startsWith('94')) {
      // Add + if missing
      phone = '+' + phone;
    } else if (!phone.startsWith('+94')) {
      // Any other format → assume local, add +94
      phone = '+94' + phone;
    }

    return `whatsapp:${phone}@c.us`;
  }

  /**
   * Safe method to send message via WhatsApp client
   */
  private async sendMessageSafely(
    client: any,
    phone: string,
    message: string
  ): Promise<boolean> {
    try {
      const cleaned = this.cleanPhoneNumber(phone);
      const formatted = this.formatSriLankaNumber(cleaned);

      this.logger.debug(`Sending message to ${formatted}: ${message.substring(0, 50)}...`);

      await client.sendMessage('94774089929@c.us', message);
      return true;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send message to ${phone}: ${errMsg}`);

      // Retry once with +94 prefix if not already there
      const cleaned = this.cleanPhoneNumber(phone);
      if (!cleaned.startsWith('94')) {
        try {
          const retryNumber = this.formatSriLankaNumber('0' + cleaned); // prepend 0 → +94
          await client.sendMessage(retryNumber, message);
          this.logger.log(`Sent with retry to ${retryNumber}`);
          return true;
        } catch (retryError: unknown) {
          const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
          this.logger.error(`Retry also failed: ${retryMsg}`);
        }
      }

      return false;
    }
  }



  private async getOrCreateCustomer(
    businessId: number,
    phone: string,
    name: string
  ): Promise<Customer> {
    let customer = await this.customerRepo.findOne({
      where: {
        business: { id: businessId },
        phone: phone
      },
      relations: ['business']
    });

    if (!customer) {
      const business = await this.businessRepo.findOne({
        where: { id: businessId }
      });

      if (!business) {
        throw new Error(`Business ${businessId} not found`);
      }

      customer = this.customerRepo.create({
        business: business,
        phone: phone,
        name: name || 'Customer',
        created_at: new Date()
      });
      customer = await this.customerRepo.save(customer);
      this.logger.log(`Created new customer: ${name} (${phone})`);
    } else if (name && customer.name !== name) {
      // Update name if provided and different
      customer.name = name;
      await this.customerRepo.save(customer);
      this.logger.log(`Updated customer name to: ${name}`);
    }

    return customer;
  }

  private async isBusinessStaff(businessId: number, phone: string): Promise<boolean> {
    try {
      // Check if phone belongs to owner
      const owner = await this.businessRepo
        .createQueryBuilder('business')
        .innerJoin('business.owner', 'owner')
        .where('business.id = :businessId', { businessId })
        .andWhere('owner.phone = :phone', { phone })
        .getOne();

      if (owner) return true;

      // Check if phone belongs to manager
      const manager = await this.businessRepo
        .createQueryBuilder('business')
        .innerJoin('business.managers', 'manager')
        .innerJoin('manager.user', 'user')
        .where('business.id = :businessId', { businessId })
        .andWhere('user.phone = :phone', { phone })
        .getOne();

      if (manager) return true;

      // Check if phone belongs to staff
      const staff = await this.businessRepo
        .createQueryBuilder('business')
        .innerJoin('business.staff', 'staff')
        .innerJoin('staff.user', 'user')
        .where('business.id = :businessId', { businessId })
        .andWhere('user.phone = :phone', { phone })
        .getOne();

      return !!staff;
    } catch (error) {
      this.logger.error(`Error checking staff status: ${error}`);
      return false;
    }
  }

  // private async handleStaffMessage(
  //   client: any,
  //   businessId: number,
  //   phone: string,
  //   message: string
  // ) {
  //   try {
  //     // Handle staff commands
  //     if (message.startsWith('/')) {
  //       await this.processStaffCommand(client, businessId, phone, message);
  //     }
  //     // Staff can also chat with AI for assistance
  //   } catch (error) {
  //     this.logger.error(`Staff message handling error: ${error}`);
  //   }
  // }

  private async sendTodayOrders(client: any, businessId: number, staffPhone: string) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const orders = await this.orderRepo.find({
        where: {
          business: { id: businessId },
          created_at: MoreThanOrEqual(today)
        },
        relations: ['customer'],
        order: { created_at: 'DESC' }
      });

      if (orders.length === 0) {
        await this.sendMessageSafely(
          client,
          staffPhone,
          "No orders today."
        );
        return;
      }

      let message = `📊 Today's Orders (${orders.length}):\n\n`;

      for (const order of orders) {
        message += `Order #${order.order_number}\n`;
        message += `Customer: ${order.customer?.name || 'Unknown'}\n`;
        message += `Amount: $${order.total_amount.toFixed(2)}\n`;
        message += `Status: ${order.status}\n`;
        message += `---\n`;
      }

      await this.sendMessageSafely(
        client,
        staffPhone,
        message
      );
    } catch (error) {
      this.logger.error(`Error sending today's orders: ${error}`);
    }
  }

  private async validateAndCalculateOrder(
    businessId: number,
    items: Array<{ productName: string; variantName?: string; quantity: number }>
  ): Promise<{ orderItems: any[]; totalAmount: number }> {
    const orderItems = [];
    let totalAmount = 0;

    for (const item of items) {
      // Find product variant
      const query = this.variantRepo
        .createQueryBuilder('variant')
        .innerJoin('variant.product', 'product')
        .where('product.business_id = :businessId', { businessId })
        .andWhere('product.is_active = true')
        .andWhere('variant.is_active = true');

      if (item.variantName) {
        query.andWhere('variant.variant_name LIKE :variantName', {
          variantName: `%${item.variantName}%`
        });
      } else {
        query.andWhere('product.name LIKE :productName', {
          productName: `%${item.productName}%`
        });
      }

      const variant = await query.getOne();

      if (variant && variant.stock >= item.quantity) {
        orderItems.push({
          variant: variant,
          quantity: item.quantity,
          unitPrice: variant.price
        });
        totalAmount += variant.price * item.quantity;
      }
    }

    return { orderItems, totalAmount };
  }

  private async calculateDeliveryFee(businessId: number, orderItems: any[]): Promise<number> {
    // Implement based on BusinessDeliveryFee entity
    // For now, return 0 or implement simple logic
    return orderItems.length > 0 ? 5.00 : 0; // Example: $5 delivery fee
  }

  private async updateInventory(
    variantId: number,
    quantity: number,
    type: 'IN' | 'OUT',
    note: string
  ) {
    try {
      const transaction = this.inventoryRepo.create({
        variant: { id: variantId },
        quantity: Math.abs(quantity),
        type: type,
        note: note
      });
      await this.inventoryRepo.save(transaction);

      // Update variant stock
      await this.variantRepo
        .createQueryBuilder()
        .update(ProductVariant)
        .set({
          stock: () => type === 'IN' ? `stock + ${quantity}` : `stock - ${quantity}`
        })
        .where('id = :variantId', { variantId })
        .execute();
    } catch (error) {
      this.logger.error(`Inventory update error: ${error}`);
      throw error;
    }
  }

  private async notifyStaff(
    client: any,
    businessId: number,
    order: Order,
    customer: Customer
  ) {
    try {
      // Get staff phones (owner, managers)
      const business = await this.businessRepo.findOne({
        where: { id: businessId },
        relations: ['owner', 'managers', 'staff']
      });

      if (!business) {
        this.logger.error(`Business ${businessId} not found for notification`);
        return;
      }

      const staffPhones: string[] = [];

      // Add owner phone if available
      if (business.owner?.phone) {
        staffPhones.push(business.owner.phone);
      }

      // Add manager phones
      if (business.managers) {
        for (const manager of business.managers) {
          if (manager.user?.phone) {
            staffPhones.push(manager.user.phone);
          }
        }
      }

      // Add staff phones 
      if (business.staff) {
        for (const staff of business.staff) {
          if (staff.user?.phone) {
            staffPhones.push(staff.user.phone);
          }
        }
      }

      // Remove duplicates
      const uniquePhones = [...new Set(staffPhones)].filter(phone => phone && phone.trim() !== '');

      if (uniquePhones.length === 0) {
        this.logger.warn(`No staff phones found for business ${businessId}`);
        return;
      }

      const notification = `🆕 New Order!\n\nOrder #: ${order.order_number}\nCustomer: ${customer.name}\nPhone: ${customer.phone}\nAmount: $${order.total_amount.toFixed(2)}\nStatus: ${order.status}`;

      for (const phone of uniquePhones) {
        try {
          await this.sendMessageSafely(client, phone, notification);
          this.logger.log(`Notified staff ${phone} about order ${order.order_number}`);
        } catch (error) {
          this.logger.error(`Failed to notify staff ${phone}: ${error}`);
        }
      }
    } catch (error) {
      this.logger.error(`Staff notification error: ${error}`);
    }
  }

  private isWithinBusinessHours(settings: BusinessSettings): boolean {
    if (!settings?.business_hours_start || !settings?.business_hours_end) {
      return true; // Always open if no hours set
    }

    try {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();

      const [startHour, startMinute] = settings.business_hours_start.split(':').map(Number);
      const [endHour, endMinute] = settings.business_hours_end.split(':').map(Number);

      const startTime = startHour * 60 + startMinute;
      const endTime = endHour * 60 + endMinute;

      return currentTime >= startTime && currentTime <= endTime;
    } catch (error) {
      this.logger.error(`Error checking business hours: ${error}`);
      return true; // Default to open on error
    }
  }

  private async sendQuickReplies(
    client: any,
    phone: string,
    actions: string[]
  ) {
    try {
      const quickReplies = `\n\nQuick actions:\n${actions.slice(0, 3).map((a, i) => `${i + 1}. ${a}`).join('\n')}`;
      await this.sendMessageSafely(client, phone, quickReplies);
    } catch (error) {
      this.logger.error(`Error sending quick replies: ${error}`);
    }
  }

  private async saveCustomerMessage(
    customer: Customer,
    content: string,
    direction: 'sent' | 'received',
    intent: string
  ) {
    try {
      // You can implement message logging here
      // Example: create a Message entity
      this.logger.debug(`Message saved: ${customer.name} - ${intent} - ${content.substring(0, 50)}...`);
    } catch (error) {
      this.logger.error(`Error saving message: ${error}`);
    }
  }

}