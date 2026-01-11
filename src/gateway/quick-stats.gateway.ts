import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import * as jwt from 'jsonwebtoken';
import { DashboardService } from '../dashboard/dashboard.service';

interface ExtSocket extends WebSocket {
  businessId?: number;
  userId?: number;
}

@Injectable()
@WebSocketGateway({
  cors: { origin: 'http://localhost:8080', credentials: true },
  path: '/ws/quick-stats',
})
export class QuickStatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  wss!: Server;

  private businessSockets = new Map<number, Set<ExtSocket>>();

  constructor(private readonly dashboardService: DashboardService) { }

  async handleConnection(client: ExtSocket, req: any) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      const businessId = Number(url.searchParams.get('businessId'));

      if (!token) throw new UnauthorizedException('Missing JWT');
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET is not defined');

      const payload = jwt.verify(token, secret) as any;

      client.userId = payload.sub;
      client.businessId = businessId;

      if (!this.businessSockets.has(client.businessId!)) {
        this.businessSockets.set(client.businessId!, new Set());
      }

      this.businessSockets.get(client.businessId!)!.add(client);

      console.log(`QuickStats WS Connected → User ${client.userId}, Business ${client.businessId}`);

      // Send initial stats
      const stats = await this.dashboardService.getQuickStats(client.businessId, client.userId!);
      client.send(JSON.stringify(stats));
    } catch (err) {
      console.log('QuickStats WS Auth failed:', err);
      client.close(1008, 'Unauthorized'); // 1008 = Policy Violation
    }
  }

  handleDisconnect(client: ExtSocket) {
    const businessId = client.businessId;
    const clients = this.businessSockets.get(businessId!);
    if (clients) {
      clients.delete(client);
      if (clients.size === 0) this.businessSockets.delete(businessId!);
    }
  }

  // Broadcast updated stats to all clients of a business
  async broadcastStats(businessId: number) {
    const stats = await this.dashboardService.getQuickStats(businessId);
    const clients = this.businessSockets.get(businessId);
    if (!clients) return;

    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(stats));
      }
    }
  }

}


// await this.quickStatsGateway.broadcastStats(businessId);
