import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { timingSafeEqual } from 'crypto';
import { RedisService } from '../../infra/redis/redis.service';

interface AuthedSocket extends Socket {
  data: {
    authType?: 'staff' | 'session';
    sessionId?: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3003', 'http://localhost:3002'],
    credentials: true,
  },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly redis: RedisService) {}

  async handleConnection(client: AuthedSocket) {
    const staffKey =
      (client.handshake.headers['x-staff-key'] as string) ??
      (client.handshake.auth?.staffKey as string);
    const sessionToken =
      (client.handshake.headers['x-session-token'] as string) ??
      (client.handshake.auth?.sessionToken as string);

    const expected = process.env.STAFF_API_KEY;
    if (expected && staffKey) {
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(staffKey, 'utf8');
      if (a.length === b.length && timingSafeEqual(a, b)) {
        client.data.authType = 'staff';
        this.logger.log(`Staff client connected: ${client.id}`);
        return;
      }
    }

    if (sessionToken) {
      const data = await this.redis.get(`session:${sessionToken}`);
      if (data) {
        const session = JSON.parse(data) as { sessionId: string };
        client.data.authType = 'session';
        client.data.sessionId = session.sessionId;
        this.logger.log(`Session client connected: ${client.id}`);
        return;
      }
    }

    this.logger.warn(`Unauthenticated WS connection rejected: ${client.id}`);
    client.emit('error', { message: 'Authentication required' });
    client.disconnect(true);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:tenant')
  handleJoinTenant(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { slug: string; role: string },
  ) {
    if (client.data.authType !== 'staff') {
      client.emit('error', { message: 'Staff auth required for tenant rooms' });
      return;
    }

    const room = `tenant:${data.slug}:${data.role}`;
    client.join(room);
    client.join(`tenant:${data.slug}`);
    this.logger.log(`Client ${client.id} joined room ${room}`);
  }

  @SubscribeMessage('join:session')
  handleJoinSession(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { sessionId: string },
  ) {
    if (
      client.data.authType === 'session' &&
      client.data.sessionId !== data.sessionId
    ) {
      client.emit('error', { message: 'Session mismatch' });
      return;
    }

    const room = `session:${data.sessionId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined session room ${room}`);
  }

  // --- Emit helpers used by other services ---

  emitOrderStatusUpdate(slug: string, orderId: string, status: string, tableLabel?: string) {
    this.server.to(`tenant:${slug}:waiter`).emit('order:status', {
      orderId,
      status,
      tableLabel,
      timestamp: new Date().toISOString(),
    });

    this.server.to(`tenant:${slug}:kitchen`).emit('order:status', {
      orderId,
      status,
      tableLabel,
      timestamp: new Date().toISOString(),
    });
  }

  emitNewOrder(slug: string, orderData: Record<string, unknown>) {
    this.server.to(`tenant:${slug}:kitchen`).emit('order:new', {
      ...orderData,
      timestamp: new Date().toISOString(),
    });

    this.server.to(`tenant:${slug}:waiter`).emit('order:new', {
      ...orderData,
      timestamp: new Date().toISOString(),
    });
  }

  emitOrderReady(slug: string, orderId: string, tableLabel: string) {
    this.server.to(`tenant:${slug}:waiter`).emit('order:ready', {
      orderId,
      tableLabel,
      timestamp: new Date().toISOString(),
    });
  }

  emitOrderClaimed(slug: string, orderId: string, claimedBy: string) {
    this.server.to(`tenant:${slug}:waiter`).emit('order:claimed', {
      orderId,
      claimedBy,
      timestamp: new Date().toISOString(),
    });
  }

  emitWaiterCall(
    slug: string,
    callData: {
      callId: string;
      tableLabel: string;
      tableCode: string;
      reason?: string;
    },
  ) {
    this.server.to(`tenant:${slug}:waiter`).emit('waiter:call', {
      ...callData,
      timestamp: new Date().toISOString(),
    });
  }

  emitWaiterCallAcknowledged(slug: string, callId: string, sessionId: string) {
    this.server.to(`session:${sessionId}`).emit('waiter:acknowledged', {
      callId,
      timestamp: new Date().toISOString(),
    });
  }

  emitToSession(sessionId: string, event: string, data: unknown) {
    this.server.to(`session:${sessionId}`).emit(event, data);
  }
}
