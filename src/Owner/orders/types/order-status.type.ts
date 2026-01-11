import { OrderStatus } from "../../../database/entities/order.entity";


export const ORDER_STATUS_META: Record<
    OrderStatus,
    { emoji: string; title: string }
> = {
    pending: { emoji: '⏳', title: 'Order Pending' },
    confirmed: { emoji: '✅', title: 'Order Confirmed' },
    paid: { emoji: '💳', title: 'Payment Received' },
    processing: { emoji: '🔄', title: 'Order Processing' },
    shipped: { emoji: '📦', title: 'Order Shipped' },
    out_for_delivery: { emoji: '🚚', title: 'Out for Delivery' },
    delivered: { emoji: '🎉', title: 'Order Delivered' },
    return_requested: { emoji: '↩️', title: 'Return Requested' },
    returned: { emoji: '📥', title: 'Order Returned' },
    canceled: { emoji: '❌', title: 'Order Canceled' },
    refunded: { emoji: '💸', title: 'Refund Completed' },
    partially_refunded: { emoji: '💰', title: 'Partial Refund Issued' },
};
