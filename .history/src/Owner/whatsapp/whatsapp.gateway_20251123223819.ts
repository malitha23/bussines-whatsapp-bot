import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';

@WebSocketGateway({
  path: '/ws/whatsapp',
  cors: true,
})
export class WhatsAppGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  wss!: Server;

  private businessClients = new Map<number, Set<WebSocket>>();

  handleConnection(client: any) {
    // FIX: read query params from client.url
    const urlObj = new URL(client.url, 'http://localhost');
    const businessId = Number(urlObj.searchParams.get('businessId'));

    client.businessId = businessId;

    // Save client
    if (!this.businessClients.has(businessId)) {
      this.businessClients.set(businessId, new Set());
    }
    this.businessClients.get(businessId)!.add(client);

    console.log(`✅ Client connected for businessId: ${businessId}`);
  }

  handleDisconnect(client: any) {
    const businessId = client.businessId;

    if (this.businessClients.has(businessId)) {
      this.businessClients.get(businessId)!.delete(client);
      if (this.businessClients.get(businessId)!.size === 0) {
        this.businessClients.delete(businessId);
      }
    }

    console.log(`❌ Client disconnected for businessId: ${businessId}`);
  }

  private sendToBusiness(businessId: number, data: any) {
    const clients = this.businessClients.get(businessId);
    if (!clients) return;

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }

  sendQR(businessId: number, qr: string) {
    this.sendToBusiness(businessId, { type: 'qr', data: qr });
  }

  sendReady(businessId: number) {
    this.sendToBusiness(businessId, { type: 'ready' });
  }

  sendDisconnected(businessId: number) {
    this.sendToBusiness(businessId, { type: 'disconnected' });
  }
}
