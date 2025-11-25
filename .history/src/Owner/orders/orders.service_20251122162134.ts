import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { In, IsNull, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { DeliveryStatus, Order, PaymentMethod, PaymentStatus } from '../../database/entities/order.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import { WhatsAppClientManager } from '../whatsapp/service/whatsapp-client.manager';
import { ProductVariant } from '../../database/entities/product-variant.entity';
import { InventoryStock } from '../../database/entities/inventory-stock.entity';
import { InventoryTransaction } from '../../database/entities/inventory-transaction.entity';
import { getBotMessage } from '../whatsapp/helpers/getBotMessage';
import { BotMessage } from '../../database/entities/bot-messages.entity';
import { Client } from 'whatsapp-web.js';
import { UserState } from '../../database/entities/user_states.entity';

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

    // async updatePaymentStatus(id: number, status: PaymentStatus | 'refund') {
    //     const order = await this.orderRepo.findOne({
    //         where: { id },
    //         relations: ['customer', 'business', 'items', 'items.variant', 'items.variant.product'],
    //     });
    //     if (!order) throw new NotFoundException(`Order #${id} not found`);

    //     order.payment_status = status as PaymentStatus;

    //     // Auto-update order.status
    //     switch (status) {
    //         case 'paid':
    //             order.status = 'paid';
    //             break;
    //         case 'pending':
    //         case 'failed':
    //             order.status = 'pending';
    //             break;
    //         case 'refund':
    //             order.status = 'refunded';
    //             break;
    //     }

    //     await this.orderRepo.save(order);

    //     // Update inventory if needed
    //     if (status === 'paid' || status === 'refund') {
    //         for (const item of order.items) {
    //             const variant = await this.productVariantRepo.findOne({
    //                 where: { id: item.variant.id },
    //                 relations: ['product'], // <- load the product relation
    //             });

    //             if (!variant) continue;

    //             const qtyChange = item.quantity;
    //             let type: 'IN' | 'OUT';
    //             let newStock = variant.stock;

    //             if (status === 'paid') {
    //                 // Reduce stock
    //                 newStock -= qtyChange;
    //                 type = 'OUT';
    //             } else {
    //                 // Refund → restore stock
    //                 newStock += qtyChange;
    //                 type = 'IN';
    //             }

    //             // Update product_variants.stock 
    //             variant.stock = newStock;
    //             await this.productVariantRepo.save(variant);

    //             // Update inventory_stock (you can choose location; default: 'warehouse')
    //             let stockRecord = await this.inventoryStockRepo.findOne({
    //                 where: { variant: { id: variant.id }, location: 'warehouse' },
    //             });

    //             if (!stockRecord) {
    //                 stockRecord = this.inventoryStockRepo.create({
    //                     variant: variant,
    //                     quantity: type === 'OUT' ? 0 : qtyChange,
    //                     location: 'warehouse',
    //                 });
    //             } else {
    //                 stockRecord.quantity = type === 'OUT'
    //                     ? stockRecord.quantity - qtyChange
    //                     : stockRecord.quantity + qtyChange;
    //             }

    //             await this.inventoryStockRepo.save(stockRecord);

    //             // Log in inventory_transactions
    //             const transaction = this.inventoryTransactionRepo.create({
    //                 product: variant.product,
    //                 variant: variant,
    //                 quantity: qtyChange,
    //                 type,
    //                 note: `Order #${order.id} ${status}`,
    //             });
    //             await this.inventoryTransactionRepo.save(transaction);
    //         }
    //     }

    //     // WhatsApp notification (same as before)
    //     try {
    //         if (this.waClientManager.isConnected(order.business.id)) {
    //             const client = await this.waClientManager.createClient(order.business.id);
    //             const phone = order.customer.phone.includes('@c.us')
    //                 ? order.customer.phone
    //                 : `${order.customer.phone}@c.us`;

    //             let itemsList = '';
    //             let total = 0;
    //             order.items.forEach((item, index) => {
    //                 const productName = item.variant?.product?.name || 'Product';
    //                 const variantName = item.variant?.variant_name || '';
    //                 const qty = item.quantity;
    //                 const price = item.price_per_unit;
    //                 const lineTotal = item.total_price || price * qty;
    //                 total += lineTotal;
    //                 itemsList += `${index + 1}. ${productName}${variantName ? ` (${variantName})` : ''} - Qty: ${qty}, Rs.${lineTotal}\n`;
    //             });

    //             let message = `Dear ${order.customer.name},\n\n`;
    //             switch (status) {
    //                 case 'paid':
    //                     message += `✅ Your payment for order #${order.id} has been received.\nInventory updated.\n\n`;
    //                     break;
    //                 case 'refund':
    //                     message += `💸 Your order #${order.id} has been refunded.\nInventory restored.\n\n`;
    //                     break;
    //                 case 'pending':
    //                     message += `ℹ️ Your payment for order #${order.id} is pending.\n\n`;
    //                     break;
    //                 case 'failed':
    //                     message += `❌ Payment failed for order #${order.id}.\n\n`;
    //                     break;
    //             }

    //             message += `📦 Order Details:\n${itemsList}\n💰 Total: Rs.${total}\n\nThank you for shopping with us! 🙏`;

    //             await client.sendMessage(phone, message);
    //         }
    //     } catch (err) {
    //         console.error(`Failed to send WhatsApp message for order ${order.id}:`, err);
    //     }

    //     return order;
    // }

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

        // WhatsApp notification in user's language
        try {
            if (this.waClientManager.isConnected(order.business.id)) {
                const client: Client = await this.waClientManager.createClient(order.business.id);
                const phone = order.customer.phone.includes('@c.us')
                    ? order.customer.phone
                    : `${order.customer.phone}@c.us`;
                const language = await this.getUserLanguage(phone, this.userStateRepo);

                // Build items list
                let itemsList = '';
                let total = 0;
                for (let index = 0; index < order.items.length; index++) {
                    const item = order.items[index];
                    const productName = item.variant?.product?.name || await getBotMessage(
                        this.botMessageRepo, order.business.id, language, 'updatePaymentStatus_product_default_name'
                    );
                    const variantName = item.variant?.variant_name || '';
                    const qty = item.quantity;
                    const price = item.price_per_unit;
                    const lineTotal = item.total_price || price * qty;
                    total += lineTotal;
                    itemsList += `${index + 1}. ${productName}${variantName ? ` (${variantName})` : ''} - Qty: ${qty}, Rs.${lineTotal}\n`;
                }

                // Fetch header and thank you messages with prefix
                const messageHeader = await getBotMessage(
                    this.botMessageRepo, order.business.id, language, `updatePaymentStatus_${status}`
                ) || '';

                const thankYou = await getBotMessage(
                    this.botMessageRepo, order.business.id, language, 'updatePaymentStatus_thank_you'
                ) || '🙏 Thank you for shopping with us!';

                const message = `${messageHeader} #${order.id}\n\n📦 Order Details:\n${itemsList}\n💰 Total: Rs.${total}\n\n${thankYou}`;

                await client.sendMessage(phone, message);
            }
        } catch (err) {
            console.error(`Failed to send WhatsApp message for order ${order.id}:`, err);
        }

        return order;
    }



    // async updateDeliveryStatus(id: number, status: DeliveryStatus) {
    //     if (!['pending', 'shipped', 'delivered', 'canceled'].includes(status))
    //         throw new BadRequestException(`Invalid delivery status: ${status}`);

    //     const order = await this.getOrder(id);

    //     // Fetch items
    //     const items = await this.itemRepo.find({
    //         where: { order: { id: order.id } },
    //         relations: ['variant', 'variant.product'],
    //     });

    //     order.delivery_status = status;

    //     // Auto-update order.status based on delivery
    //     switch (status) {
    //         case 'shipped':
    //             if (order.payment_status === 'paid') order.status = 'shipped';
    //             break;
    //         case 'delivered':
    //             if (order.payment_status === 'paid') order.status = 'delivered';
    //             break;
    //         case 'canceled':
    //             order.status = 'canceled';
    //             break;
    //     }

    //     const updatedOrder = await this.orderRepo.save(order);

    //     // WhatsApp notification
    //     if (this.waClientManager.isConnected(order.business.id)) {
    //         try {
    //             const client = await this.waClientManager.createClient(order.business.id);
    //             const phone = order.customer.phone.includes('@c.us')
    //                 ? order.customer.phone
    //                 : `${order.customer.phone}@c.us`;

    //             let itemsList = '';
    //             let total = 0;
    //             items.forEach((item, index) => {
    //                 const productName = item.variant?.product?.name || 'Product';
    //                 const variantName = item.variant?.variant_name || '';
    //                 const qty = item.quantity;
    //                 const price = item.price_per_unit;
    //                 const lineTotal = item.total_price || price * qty;
    //                 total += lineTotal;

    //                 itemsList += `${index + 1}. ${productName}${variantName ? ` (${variantName})` : ''} - Qty: ${qty}, Rs.${lineTotal}\n`;
    //             });

    //             let message = `Dear ${order.customer.name},\n\n`;
    //             switch (status) {
    //                 case 'shipped':
    //                     message += `🚚 Your order #${order.id} has been shipped.\n\n`;
    //                     break;
    //                 case 'delivered':
    //                     message += `✅ Your order #${order.id} has been delivered. We hope you enjoy your products!\n\n`;
    //                     break;
    //                 case 'canceled':
    //                     message += `❌ Your order #${order.id} has been canceled. Please contact support for details.\n\n`;
    //                     break;
    //                 default:
    //                     message += `ℹ️ Your order #${order.id} status is now ${status}.\n\n`;
    //             }

    //             message += `📦 Order Details:\n${itemsList}\n💰 Total: Rs.${total}\n\nThank you for shopping with us! 🙏`;

    //             await client.sendMessage(phone, message);
    //         } catch (err) {
    //             console.error(`Failed to send WhatsApp message for order ${order.id}:`, err);
    //         }
    //     }

    //     return updatedOrder;
    // }

    async updateDeliveryStatus(
        id: number,
        status: DeliveryStatus
    ) {
        if (!['pending', 'shipped', 'delivered', 'canceled'].includes(status))
            throw new BadRequestException(`Invalid delivery status: ${status}`);

        const order = await this.orderRepo.findOne({
            where: { id },
            relations: ['customer', 'business'],
        });
        if (!order) throw new NotFoundException(`Order #${id} not found`);

        // Fetch items
        const items = await this.itemRepo.find({
            where: { order: { id: order.id } },
            relations: ['variant', 'variant.product'],
        });

        // Update delivery and order status
        order.delivery_status = status;
        switch (status) {
            case 'shipped':
                if (order.payment_status === 'paid') order.status = 'shipped';
                break;
            case 'delivered':
                if (order.payment_status === 'paid') order.status = 'delivered';
                break;
            case 'canceled':
                order.status = 'canceled';
                break;
        }

        const updatedOrder = await this.orderRepo.save(order);

        // WhatsApp notification
        if (this.waClientManager.isConnected(order.business.id)) {
            try {
                const client: Client = await this.waClientManager.createClient(order.business.id);
                const phone = order.customer.phone.includes('@c.us')
                    ? order.customer.phone
                    : `${order.customer.phone}@c.us`;
                // Get user language from user_states
                const userState = await this.userStateRepo.findOne({ where: { phone: phone } });
                const language = userState?.language || 'en';

                // Prepare order items text
                let itemsList = '';
                let total = 0;
                for (let index = 0; index < items.length; index++) {
                    const item = items[index];
                    const productName = item.variant?.product?.name
                        || await getBotMessage(this.botMessageRepo, order.business.id, language, 'updateDeliveryStatus_product_default_name');
                    const variantName = item.variant?.variant_name || '';
                    const qty = item.quantity;
                    const price = item.price_per_unit;
                    const lineTotal = item.total_price || price * qty;
                    total += lineTotal;

                    itemsList += `${index + 1}. ${productName}${variantName ? ` (${variantName})` : ''} - Qty: ${qty}, Rs.${lineTotal}\n`;
                }

                // Get status message and thank you
                let statusMessage = await getBotMessage(this.botMessageRepo, order.business.id, language, `updateDeliveryStatus_${status}`);
                statusMessage = statusMessage || ''; // fallback
                let thankYou = await getBotMessage(this.botMessageRepo, order.business.id, language, 'updateDeliveryStatus_thank_you');
                thankYou = thankYou || '🙏 Thank you for shopping with us!';

                const message = `${statusMessage} #${order.id}\n\n📦 Order Details:\n${itemsList}\n💰 Total: Rs.${total}\n\n${thankYou}`;

                await client.sendMessage(phone, message);

            } catch (err) {
                console.error(`Failed to send WhatsApp message for order ${order.id}:`, err);
            }
        }

        return updatedOrder;
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
