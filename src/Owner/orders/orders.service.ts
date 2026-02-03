import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { In, IsNull, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeliveryStatus,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../database/entities/order.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import { WhatsAppClientManager } from '../whatsapp/service/whatsapp-client.manager';
import { ProductVariant } from '../../database/entities/product-variant.entity';
import { InventoryStock } from '../../database/entities/inventory-stock.entity';
import { InventoryTransaction } from '../../database/entities/inventory-transaction.entity';
import { getBotMessage } from '../whatsapp/helpers/getBotMessage';
import { BotMessage } from '../../database/entities/bot-messages.entity';

import { UserState } from '../../database/entities/user_states.entity';
import { ORDER_STATUS_META } from './types/order-status.type';
import { SendTextMessagesManager } from '../whatsapp/service/sendMessageManager';
import { UpdateTrackingDto } from '../../orders/dro/TrackingDto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,

    @InjectRepository(OrderItem)
    private readonly itemRepo: Repository<OrderItem>,
    private readonly waClientManager: WhatsAppClientManager,
    @InjectRepository(ProductVariant)
    private readonly productVariantRepo: Repository<ProductVariant>,
    @InjectRepository(InventoryStock)
    private readonly inventoryStockRepo: Repository<InventoryStock>,
    @InjectRepository(InventoryTransaction)
    private readonly inventoryTransactionRepo: Repository<InventoryTransaction>,
    @InjectRepository(BotMessage)
    private readonly botMessageRepo: Repository<BotMessage>,
    @InjectRepository(UserState)
    private readonly userStateRepo: Repository<UserState>,
  ) {}

  async createOrder(businessId: number, dto: any) {
    const order = this.orderRepo.create({
      ...dto,
      business: { id: businessId },
    });
    return await this.orderRepo.save(order);
  }

  async getAllOrders(businessId: number) {
    return await this.orderRepo.find({
      where: { business: { id: businessId } },
      relations: ['customer', 'items', 'items.variant'],
      order: { created_at: 'DESC' },
    });
  }

  async getOrdersWithFilters(
    businessId: number,
    payment_status?: PaymentStatus,
    delivery_status?: DeliveryStatus,
    payment_method?: PaymentMethod,
  ) {
    const query = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('items.variant', 'variant')
      .where('order.businessId = :businessId', { businessId })
      .orderBy('order.created_at', 'DESC');

    if (payment_status) {
      query.andWhere('order.payment_status = :payment_status', {
        payment_status,
      });
    }

    if (delivery_status) {
      query.andWhere('order.delivery_status = :delivery_status', {
        delivery_status,
      });
    }

    if (payment_method) {
      query.andWhere('order.payment_method = :payment_method', {
        payment_method,
      });
    }

    return await query.getMany();
  }

  async getOrder(id: number) {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: ['customer', 'items', 'items.variant'],
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateOrder(id: number, dto: any) {
    const order = await this.getOrder(id);
    Object.assign(order, dto);
    return await this.orderRepo.save(order);
  }

  async deleteOrder(id: number) {
    const result = await this.orderRepo.delete(id);
    if (!result.affected) throw new NotFoundException('Order not found');
    return { message: 'Order deleted successfully' };
  }

  async getOrdersByCustomer(customerId: number) {
    return await this.orderRepo.find({
      where: { customer: { id: customerId } },
      relations: ['items', 'items.variant'],
      order: { created_at: 'DESC' },
    });
  }

  async getUserLanguage(
    phone: string,
    userStateRepo: Repository<UserState>,
  ): Promise<string> {
    const state = await userStateRepo.findOne({ where: { phone } });
    return state?.language || 'en'; // default to English
  }

  async updatePaymentStatus(id: number, status: PaymentStatus | 'refunded') {
    // Get the order with items and relations
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: [
        'customer',
        'business',
        'items',
        'items.variant',
        'items.variant.product',
      ],
    });
    if (!order) throw new NotFoundException(`Order #${id} not found`);

    order.payment_status = status as PaymentStatus;

    // Auto-update order.status
    switch (status) {
      case 'paid':
        order.status = 'paid';
        break;
      case 'pending':
      case 'failed':
        order.status = 'pending';
        break;
      case 'refunded':
        order.status = 'refunded';
        break;
    }

    await this.orderRepo.save(order);

    // Update inventory if needed
    if (status === 'paid' || status === 'refunded') {
      for (const item of order.items) {
        const variant = await this.productVariantRepo.findOne({
          where: { id: item.variant.id },
          relations: ['product'],
        });
        if (!variant) continue;

        const qtyChange = Number(item.quantity); // ensure number
        let type: 'IN' | 'OUT';
        let newStock = Number(variant.stock); // ensure number

        if (status === 'paid') {
          newStock -= qtyChange;
          type = 'OUT';
        } else {
          newStock += qtyChange;
          type = 'IN';
        }

        // Update product_variants table
        variant.stock = newStock;
        await this.productVariantRepo.save(variant);

        // Update inventory_stock table
        let stockRecord = await this.inventoryStockRepo.findOne({
          where: { variant: { id: variant.id }, location: 'warehouse' },
        });

        if (!stockRecord) {
          stockRecord = this.inventoryStockRepo.create({
            variant,
            quantity: type === 'OUT' ? 0 : qtyChange,
            location: 'warehouse',
          });
        } else {
          stockRecord.quantity =
            type === 'OUT'
              ? Number(stockRecord.quantity) - qtyChange
              : Number(stockRecord.quantity) + qtyChange;
        }

        await this.inventoryStockRepo.save(stockRecord);

        // Insert inventory transaction
        const transaction = this.inventoryTransactionRepo.create({
          product: variant.product,
          variant,
          quantity: qtyChange,
          type,
          note: `Order #${order.id} ${status}`,
        });
        await this.inventoryTransactionRepo.save(transaction);
      }
    }

    return order;
  }

  async updateCodInventory(id: number, orderStatus: any) {
    // Get the order with items and relations
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: [
        'customer',
        'business',
        'items',
        'items.variant',
        'items.variant.product',
      ],
    });
    if (!order) throw new NotFoundException(`Order #${id} not found`);

    let status = '';

    if (order.status === 'pending' && orderStatus === 'canceled') return;

    if (orderStatus === 'confirmed') {
      status = 'paid';
    } else if (orderStatus === 'canceled') {
      status = 'canceled';
    } else if (orderStatus === 'returned') {
      status = 'canceled';
    }

    for (const item of order.items) {
      const variant = await this.productVariantRepo.findOne({
        where: { id: item.variant.id },
        relations: ['product'],
      });
      if (!variant) continue;

      const qtyChange = Number(item.quantity); // ensure number
      let type: 'IN' | 'OUT';
      let newStock = Number(variant.stock); // ensure number

      if (status === 'paid') {
        newStock -= qtyChange;
        type = 'OUT';
      } else {
        newStock += qtyChange;
        type = 'IN';
      }

      // Update product_variants table
      variant.stock = newStock;
      await this.productVariantRepo.save(variant);

      // Update inventory_stock table
      let stockRecord = await this.inventoryStockRepo.findOne({
        where: { variant: { id: variant.id }, location: 'warehouse' },
      });

      if (!stockRecord) {
        stockRecord = this.inventoryStockRepo.create({
          variant,
          quantity: type === 'OUT' ? 0 : qtyChange,
          location: 'warehouse',
        });
      } else {
        stockRecord.quantity =
          type === 'OUT'
            ? Number(stockRecord.quantity) - qtyChange
            : Number(stockRecord.quantity) + qtyChange;
      }

      await this.inventoryStockRepo.save(stockRecord);

      // Insert inventory transaction
      const transaction = this.inventoryTransactionRepo.create({
        product: variant.product,
        variant,
        quantity: qtyChange,
        type,
        note: `Order #${order.id} Cod`,
      });
      await this.inventoryTransactionRepo.save(transaction);
    }

    return order;
  }

  async updateOrderStatus(id: number, status: OrderStatus, note: string) {
    const allowedStatuses: OrderStatus[] = [
      'pending',
      'confirmed',
      'paid',
      'processing',
      'shipped',
      'out_for_delivery',
      'delivered',
      'return_requested',
      'returned',
      'canceled',
      'refunded',
      'partially_refunded',
    ];

    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException(`Invalid order status: ${status}`);
    }

    const order = await this.orderRepo.findOne({
      where: { id },
      relations: ['customer', 'business'],
    });

    if (!order) {
      throw new NotFoundException(`Order #${id} not found`);
    }

    const items = await this.itemRepo.find({
      where: { order: { id: order.id } },
      relations: ['variant', 'variant.product'],
    });

    order.status = status;
    await this.orderRepo.save(order);

    // ---------------------------
    // WhatsApp Notification
    // ---------------------------
    if (!this.waClientManager.isConnected(order.business.id)) return;

    try {
      const client = await this.waClientManager.getClient(order.business.id);
      if (!client) return;

      let phone = order.customer.phone;
      if (!phone.includes('@c.us') && !phone.includes('@s.whatsapp.net')) {
        phone = `${phone}@c.us`;
      }

      const userState = await this.userStateRepo.findOne({ where: { phone } });
      const language = userState?.language || 'en';

      let itemsList = '';
      let total = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const productName =
          item.variant?.product?.name ||
          (await getBotMessage(
            this.botMessageRepo,
            order.business.id,
            language,
            'order_product_default_name',
          ));

        const variantName = item.variant?.variant_name || '';
        const lineTotal = Number(
          item.total_price ?? item.price_per_unit * item.quantity,
        );
        total += lineTotal;

        itemsList += `${i + 1}. ${productName}${variantName ? ` (${variantName})` : ''} - Qty: ${item.quantity}, Rs.${lineTotal}\n`;
      }

      const meta = ORDER_STATUS_META[status];

      const noteMessage =
        note && note.trim().length > 0 ? `📝 Note:\n${note}\n\n` : '';

      const customStatusMessage =
        (await getBotMessage(
          this.botMessageRepo,
          order.business.id,
          language,
          `order_status_${status}`,
        )) || 'Status updated successfully.';

      const message = `${meta.emoji} *${meta.title}*

Order ID: #${order.id}

📦 Order Summary:
${itemsList}
💰 Total: Rs. ${total}

${customStatusMessage}

${noteMessage}🙏 Thank you for shopping with us!`;

      await client.sendMessage(phone, { text: message });
    } catch (error) {
      console.error(`WhatsApp message failed for order #${order.id}`, error);
    }
  }

  async sendTrackingUpdate(orderId: number, dto: UpdateTrackingDto) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['customer', 'business'],
    });

    if (!order) {
      throw new NotFoundException(`Order #${orderId} not found`);
    }

    if (!this.waClientManager.isConnected(order.business.id)) return;

    try {
      const client = await this.waClientManager.getClient(order.business.id);
      if (!client) return;

      let phone = order.customer.phone;
      if (!phone.includes('@c.us') && !phone.includes('@s.whatsapp.net')) {
        phone = `${phone}@c.us`;
      }

      const userState = await this.userStateRepo.findOne({ where: { phone } });
      const language = userState?.language || 'en';

      const messageLines = [
        `🚚 *Order Tracking Update*`,
        ``,
        `Order ID: #${order.id}`,
        `Carrier: ${dto.carrier || 'N/A'}`,
        `Tracking Number: ${dto.tracking_number || 'N/A'}`,
        `Estimated Delivery: ${dto.estimated_delivery || 'N/A'}`,
      ];

      if (dto.additional_note) {
        messageLines.push(`Note: ${dto.additional_note}`);
      }

      messageLines.push(``, `Thank you for shopping with us!`);

      const message = messageLines.join('\n');

      await client.sendMessage(phone, { text: message });
    } catch (error) {
      console.error(
        `WhatsApp tracking message failed for order #${order.id}`,
        error,
      );
    }
  }

  async getPendingDepositOrders(businessId: number) {
    return await this.orderRepo.find({
      where: {
        business: { id: businessId },
        payment_method: 'deposit',
        payment_status: 'pending',
        payment_receipt_url: IsNull(),
      },
      relations: ['customer', 'items', 'items.variant'],
      order: { created_at: 'DESC' },
    });
  }

  async getPendingDepositOrdersByIds(
    businessId: number,
    orderIds: number[] | number, // single or multiple IDs
  ) {
    const idsArray = Array.isArray(orderIds) ? orderIds : [orderIds];

    return await this.orderRepo.find({
      where: {
        business: { id: businessId },
        id: idsArray.length > 0 ? In(idsArray) : undefined, // use In() for array
        payment_method: 'deposit',
        payment_status: 'pending',
        payment_receipt_url: IsNull(),
      },
      relations: ['customer', 'items', 'items.variant'],
      order: { created_at: 'DESC' },
    });
  }
}
