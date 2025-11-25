import { Client } from 'whatsapp-web.js';
import { IsNull, Repository } from 'typeorm';
import { Order } from '../../../../../database/entities/order.entity';
import { BotMessage } from '../../../../../database/entities/bot-messages.entity';
import { getBotMessage } from '../../../helpers/getBotMessage';


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
    botMessageRepo: Repository<BotMessage>,
) {

    // ✅ Go back to main menu
    if (cleanText === '0') {
        await sendMainMenu(client, phone, businessId, language);
        await saveUserState(businessId, phone, name, {}, 'main_menu', language);
        return;
    }

    // ✅ Upload for existing order
    if (cleanText === '1') {
        const pendingOrders = await orderRepo.find({
            where: {
                business: { id: businessId },
                customer: { phone },
                status: 'pending',
                payment_method: 'deposit',
                payment_receipt_url: IsNull(),
            },
            relations: ['items', 'items.variant', 'items.variant.product'],
            order: { created_at: 'DESC' }
        });

        if (!pendingOrders.length) {
            const msgNoPending = await getBotMessage(botMessageRepo, businessId, language, 'upload_receipt_no_pending');
            await client.sendMessage(phone, msgNoPending);
            return;
        }

        // Prepare pending orders message
        const header = await getBotMessage(botMessageRepo, businessId, language, 'upload_receipt_pending_header');
        const footer = await getBotMessage(botMessageRepo, businessId, language, 'upload_receipt_pending_footer');

        let msg = `${header}\n\n`;
        pendingOrders.forEach((o) => {
            const total = o.total_amount ? Number(o.total_amount).toFixed(2) : '0.00';
            const date = o.created_at?.toISOString().split('T')[0] || '';
            let itemsText = '';
            if (o.items && o.items.length) {
                itemsText = o.items.map(item => `${item.variant.variant_name} x${item.quantity}${item.variant.unit}`).join(', ');
            }
            msg += `Order #${o.id} - Total: Rs. ${total} - Date: ${date}\n   Items: ${itemsText}\n\n`;
        });
        msg += footer;

        // Save orders in state
        await saveUserState(businessId, phone, name, {}, 'select_order_for_receipt_upload');

        await client.sendMessage(phone, msg);
        return;
    }

    // ✅ Other/help option
    if (cleanText === '2') {
        const msgHelp = await getBotMessage(botMessageRepo, businessId, language, 'upload_receipt_help');
        await client.sendMessage(phone, msgHelp);
        return;
    }

    // Invalid input
    const msgInvalid = await getBotMessage(botMessageRepo, businessId, language, 'upload_receipt_invalid_option');
    await client.sendMessage(phone, msgInvalid);
}
