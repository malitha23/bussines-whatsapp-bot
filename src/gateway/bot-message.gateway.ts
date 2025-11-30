import { Injectable } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws'; 

interface ExtSocket extends WebSocket {
  businessId?: number;
}

@Injectable()
@WebSocketGateway({
  cors: { origin: 'http://localhost:8080', credentials: true },
  path: '/ws/bot-progress',
})
export class BotMessageGateway 
  implements OnGatewayConnection, OnGatewayDisconnect 
{
  @WebSocketServer()
  wss!: Server;

  private businessSockets = new Map<number, Set<ExtSocket>>();

  handleConnection(client: ExtSocket, req: any) {
    const url = new URL(req.url, 'http://localhost');
    const businessId = Number(url.searchParams.get('businessId'));
    client.businessId = businessId;

    if (!this.businessSockets.has(businessId)) {
      this.businessSockets.set(businessId, new Set());
    }

    this.businessSockets.get(businessId)!.add(client);
    console.log(`BOT MSG WS: Connected → Business ${businessId}`);
  }

  handleDisconnect(client: ExtSocket) {
    const businessId = client.businessId;
    const clients = this.businessSockets.get(businessId!);

    if (clients) {
      clients.delete(client);
      if (clients.size === 0) {
        this.businessSockets.delete(businessId!);
      }
    }

    console.log(`BOT MSG WS: Disconnected → Business ${businessId}`);
  }

  private broadcast(businessId: number, data: any) {
    const clients = this.businessSockets.get(businessId);
    if (!clients) return;

    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(data));
      }
    }
  }

  // Send progress %
  sendProgress(businessId: number, percent: number) {
    this.broadcast(businessId, { type: 'progress', percent });
  }

  // Send completion notification
  sendComplete(businessId: number) {
    this.broadcast(businessId, { type: 'complete' }); 
  }
}
