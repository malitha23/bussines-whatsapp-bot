import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'ws';

@WebSocketGateway({ path: '/ws/whatsapp' })
export class WhatsAppGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  wss!: Server;

  handleConnection(client: any) {
    // Get businessId from query or path
    const url = new URL(client.upgradeReq.url, 'http://localhost');
    const businessId = Number(url.pathname.split('/').pop());
    client.businessId = businessId;

    console.log(`Client connected for businessId: ${businessId}`);
  }

  handleDisconnect(client: any) {
    console.log(`Client disconnected for businessId: ${client.businessId}`);
  }

  // Send QR or ready events
  sendQR(businessId: number, qr: string) {
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === client.OPEN && client.businessId === businessId) {
        client.send(JSON.stringify({ type: 'qr', data: qr }));
      }
    });
  }

  sendReady(businessId: number) {
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === client.OPEN && client.businessId === businessId) {
        client.send(JSON.stringify({ type: 'ready' }));
      }
    });
  }

  sendDisconnected(businessId: number) {
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === client.OPEN && client.businessId === businessId) {
        client.send(JSON.stringify({ type: 'disconnected' }));
      }
    });
  }
}
