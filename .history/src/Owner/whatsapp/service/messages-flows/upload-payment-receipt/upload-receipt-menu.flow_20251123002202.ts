import { Client } from 'whatsapp-web.js';

export async function showUploadReceiptMenu(client: Client, phone: string) {
  await client.sendMessage(
    phone,
    "📄 *Upload Payment Receipt*\n\nSelect an option:\n\n" +
    "1️⃣ Upload for existing Order\n" +
    "2️⃣ Other / Help\n\n" +
    "➡️ Type 0 to go back."
  );
}
