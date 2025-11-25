export async function showOrderHistoryMenu(client: any, phone: string) {
  const msg = `📦 *My Orders*\n
1️⃣ Pending Orders  
2️⃣ Confirmed Orders  
3️⃣ Paid Orders  
4️⃣ Shipped Orders  
5️⃣ Delivered Orders  
6️⃣ Canceled Orders  
7️⃣ Refunded Orders\n  
Type 'menu' To Back Menu`;

  await client.sendMessage(phone, msg);
}
