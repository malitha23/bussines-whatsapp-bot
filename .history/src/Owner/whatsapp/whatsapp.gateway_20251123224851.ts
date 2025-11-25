import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';

// Extend WebSocket to allow custom properties
interface ExtWebSocket extends WebSocket {
    businessId?: number;
}

@WebSocketGateway({
    cors: {
        origin: 'http://localhost:8080',
        credentials: true,
    },
    path: '/ws/whatsapp',
})
export class WhatsAppGateway implements OnGatewayConnection, OnGatewayDisconnect {

    @WebSocketServer()
    wss!: Server;

    private businessClients = new Map<number, Set<ExtWebSocket>>();

    handleConnection(client: ExtWebSocket, req: any) {
        const url = new URL(req.url, 'http://localhost');
        const businessId = Number(url.searchParams.get('businessId'));

        client.businessId = businessId;

        if (!this.businessClients.has(businessId)) {
            this.businessClients.set(businessId, new Set());
        }
        this.businessClients.get(businessId)!.add(client);

        console.log(`CONNECTED WS → businessId: ${businessId}`);
    }


    handleDisconnect(client: ExtWebSocket) {
        const businessId = client.businessId;

        if (this.businessClients.has(businessId!)) {
            const set = this.businessClients.get(businessId!)!;
            set.delete(client);

            if (set.size === 0) {
                this.businessClients.delete(businessId!);
            }
        }

        console.log(`❌ Client disconnected for businessId: ${businessId}`);
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
        console.log(`📤 Sending QR to frontend for Business ${businessId}`);
        this.sendToBusiness(businessId, { type: 'qr', data: qr });
    }

    sendReady(businessId: number) {
        this.sendToBusiness(businessId, { type: 'ready' });
    }

    sendDisconnected(businessId: number) {
        this.sendToBusiness(businessId, { type: 'disconnected' });
    }
}
