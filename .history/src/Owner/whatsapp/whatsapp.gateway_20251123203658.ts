import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';

@WebSocketGateway({ path: '/ws/whatsapp' })
export class WhatsAppGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  wss!: Server;

  // Map<businessId, Set<WebSocket>>
  private businessClients = new Map<number, Set<WebSocket>>();

  handleConnection(client: any) {
    const url = new URL(client.upgradeReq.url, 'http://localhost');
    const businessId = Number(url.searchParams.get('businessId'));
    client.businessId = businessId;

    if (!this.businessClients.has(businessId)) {
      this.businessClients.set(businessId, new Set());
    }
    this.businessClients.get(businessId)!.add(client);

    console.log(`Client connected for businessId: ${businessId}`);
  }

  handleDisconnect(client: any) {
    const businessId = client.businessId;
    if (this.businessClients.has(businessId)) {
      this.businessClients.get(businessId)!.delete(client);
      if (this.businessClients.get(businessId)!.size === 0) {
        this.businessClients.delete(businessId);
      }
    }
    console.log(`Client disconnected for businessId: ${businessId}`);
  }

  private sendToBusiness(businessId: number, data: any) {
    const clients = this.businessClients.get(businessId);
    if (!clients) return;
    clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
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
