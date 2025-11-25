import { Client } from 'whatsapp-web.js';
import { IsNull, Repository } from 'typeorm';
import { Order } from '../../../../../database/entities/order.entity';

export async function handleUploadPaymentReceipt(
    client: Client,
    phone: string,
    businessId: number,
    name: string,
    cleanText: string,
    language: string,
    saveUserState: Function,
    sendMainMenu: Function,
    orderRepo: Repository<Order>,
) {

    // ✅ Go back to main menu
    if (cleanText === '0') {
        console.log("asfdasfdasfafasfasfasfasfs");
        await sendMainMenu(client, phone, businessId, language);
        await saveUserState(businessId, phone, name, {}, 'main_menu', language);
        return; // important to exit
    }

    // ✅ Upload for existing order
    if (cleanText === '1') {
        const pendingOrders = await orderRepo.find({
            where: {
                business: { id: businessId },
                customer: { phone },
                status: 'pending',
                payment_receipt_url: IsNull(),
            },
            relations: ['items', 'items.variant', 'items.variant.product'],
            order: { created_at: 'DESC' }
        });

        if (!pendingOrders.length) {
            await client.sendMessage(phone, "ℹ️ You have no pending orders without a payment receipt.\n➡️ Type 0 to go back.");
            return;
        }

        // Prepare small invoice list
        let msg = "📄 Pending Orders (No Receipt):\n\n";
        pendingOrders.forEach((o, index) => {
            const total = o.total_amount ? Number(o.total_amount).toFixed(2) : '0.00';
            const date = o.created_at?.toISOString().split('T')[0] || '';
            let itemsText = '';
            if (o.items && o.items.length) {
                itemsText = o.items.map(item => `${item.variant.variant_name} x${item.quantity}${item.variant.unit}`).join(', ');
            }
            msg += `Order #${o.id} - Total: Rs. ${total} - Date: ${date}\n   Items: ${itemsText}\n\n`;
        });

        msg += "\n➡️ Type the order id number of the order to upload its payment receipt.\n\nType 0 to go back.";

        // Save orders in state
        await saveUserState(businessId, phone, name, { }, 'select_order_for_receipt_upload');

        await client.sendMessage(phone, msg);
        return;
    }

    // ✅ Other/help option
    if (cleanText === '2') {
        await client.sendMessage(phone, "ℹ️ Please contact customer support for help with payment receipts.\n\n➡️ Type 0 to go back.");
        return;
    }

    // Invalid input
    await client.sendMessage(phone, "❌ Invalid option. Type 1, 2, or 0 to go back.");
}

