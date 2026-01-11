import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { In, IsNull, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { DeliveryStatus, Order, OrderStatus, PaymentMethod, PaymentStatus } from '../../database/entities/order.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import { WhatsAppClientManager } from '../whatsapp/service/whatsapp-client.manager';
import { ProductVariant } from '../../database/entities/product-variant.entity';
import { InventoryStock } from '../../database/entities/inventory-stock.entity';
import { InventoryTransaction } from '../../database/entities/inventory-transaction.entity';
import { getBotMessage } from '../whatsapp/helpers/getBotMessage';
import { BotMessage } from '../../database/entities/bot-messages.entity';
import { Client } from 'whatsapp-web.js';
import { UserState } from '../../database/entities/user_states.entity';
import { ORDER_STATUS_META } from './types/order-status.type';

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

    ) { }

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
            query.andWhere('order.payment_status = :payment_status', { payment_status });
        }

        if (delivery_status) {
            query.andWhere('order.delivery_status = :delivery_status', { delivery_status });
        }

        if (payment_method) {
            query.andWhere('order.payment_method = :payment_method', { payment_method });
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
        userStateRepo: Repository<UserState>
    ): Promise<string> {
        const state = await userStateRepo.findOne({ where: { phone } });
        return state?.language || 'en'; // default to English
    }

    async updatePaymentStatus(
        id: number,
        status: PaymentStatus | 'refund',
    ) {
        const order = await this.orderRepo.findOne({
            where: { id },
            relations: ['customer', 'business', 'items', 'items.variant', 'items.variant.product'],
        });
        if (!order) throw new NotFoundException(`Order #${id} not found`);

        order.payment_status = status as PaymentStatus;

        // Auto-update order.status
        switch (status) {
            case 'paid': order.status = 'paid'; break;
            case 'pending':
            case 'failed': order.status = 'pending'; break;
            case 'refund': order.status = 'refunded'; break;
        }

        await this.orderRepo.save(order);

        // Update inventory if needed
        if (status === 'paid' || status === 'refund') {
            for (const item of order.items) {
                const variant = await this.productVariantRepo.findOne({
                    where: { id: item.variant.id },
                    relations: ['product'],
                });
                if (!variant) continue;

                const qtyChange = item.quantity;
                let type: 'IN' | 'OUT';
                let newStock = variant.stock;

                if (status === 'paid') {
                    newStock -= qtyChange;
                    type = 'OUT';
                } else {
                    newStock += qtyChange;
                    type = 'IN';
                }

                variant.stock = newStock;
                await this.productVariantRepo.save(variant);

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
                    stockRecord.quantity = type === 'OUT'
                        ? stockRecord.quantity - qtyChange
                        : stockRecord.quantity + qtyChange;
                }

                await this.inventoryStockRepo.save(stockRecord);

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

    async updateOrderStatus(
        id: number,
        status: OrderStatus,
    ) {
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
            const { client } = await this.waClientManager.createClient(order.business.id);
            if (!client) return;

            const phone = order.customer.phone.includes('@c.us')
                ? order.customer.phone
                : `${order.customer.phone}@c.us`;

            const userState = await this.userStateRepo.findOne({ where: { phone } });
            const language = userState?.language || 'en';

            let itemsList = '';
            let total = 0;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const productName =
                    item.variant?.product?.name ||
                    await getBotMessage(
                        this.botMessageRepo,
                        order.business.id,
                        language,
                        'order_product_default_name',
                    );

                const variantName = item.variant?.variant_name || '';
                const lineTotal = item.total_price || item.price_per_unit * item.quantity;
                total += lineTotal;

                itemsList += `${i + 1}. ${productName}${variantName ? ` (${variantName})` : ''} - Qty: ${item.quantity}, Rs.${lineTotal}\n`;
            }

            const meta = ORDER_STATUS_META[status];

            const customStatusMessage =
                await getBotMessage(
                    this.botMessageRepo,
                    order.business.id,
                    language,
                    `order_status_${status}`,
                ) || '';

            const message = `${meta.emoji} *${meta.title}*

Order ID: #${order.id}

📦 Order Summary:
${itemsList}
💰 Total: Rs.${total}

${customStatusMessage}

🙏 Thank you for shopping with us!`;

            await client.sendMessage(phone, message);
        } catch (error) {
            console.error(`WhatsApp message failed for order #${order.id}`, error);
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
