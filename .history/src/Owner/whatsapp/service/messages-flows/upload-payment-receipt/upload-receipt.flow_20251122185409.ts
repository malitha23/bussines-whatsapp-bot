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
    if (cleanText === '1') {
        // Fetch pending orders without receipt
        const pendingOrders = await orderRepo.find({
            where: {
                business: { id: businessId },
                customer: { phone },
                status: 'pending',
                payment_receipt_url: IsNull(),
            },
            order: { created_at: 'DESC' }
        });

        if (!pendingOrders.length) {
            await client.sendMessage(phone, "ℹ️ You have no pending orders without a payment receipt.\n➡️ Type 0 to go back.");
            return;
        }

        // Prepare small invoice list
        let msg = "📄 Pending Orders (No Receipt):\n\n";
        pendingOrders.forEach((o, index) => {
            const total = o.total_amount?.toFixed(2) || '0.00'; // Adjust to your field name
            const date = o.created_at?.toISOString().split('T')[0] || '';
            msg += `${index + 1}. Order #${o.id} - Total: Rs. ${total} - Date: ${date}\n`;
        });
        msg += "\n➡️ Type the number of the order to upload its payment receipt.\nType 0 to go back.";

        // Save orders in state
        await saveUserState(businessId, phone, name, { pendingOrders }, 'select_order_for_receipt_upload');

        await client.sendMessage(phone, msg);
        return;
    }

    if (cleanText === '2') {
        await client.sendMessage(phone, "ℹ️ Please contact customer support for help with payment receipts.\n\n➡️ Type 0 to go back.");
        return;
    }

    if (cleanText === '0') {
        await sendMainMenu(client, phone, businessId, 'Business', language);
        await saveUserState(businessId, phone, name, {}, 'main_menu');
        return;
    }

    await client.sendMessage(phone, "❌ Invalid option. Type 1, 2, or 0 to go back.");
}
