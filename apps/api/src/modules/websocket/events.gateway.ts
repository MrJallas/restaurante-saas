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

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:tenant')
  handleJoinTenant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { slug: string; role: string },
  ) {
    const room = `tenant:${data.slug}:${data.role}`;
    client.join(room);
    client.join(`tenant:${data.slug}`); // also join general tenant room
    this.logger.log(`Client ${client.id} joined room ${room}`);
  }

  @SubscribeMessage('join:session')
  handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const room = `session:${data.sessionId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined session room ${room}`);
  }

  // --- Emit helpers used by other services ---

  emitOrderStatusUpdate(slug: string, orderId: string, status: string, tableLabel?: string) {
    // Notify all tenant staff
    this.server.to(`tenant:${slug}:waiter`).emit('order:status', {
      orderId,
      status,
      tableLabel,
      timestamp: new Date().toISOString(),
    });

    // Notify kitchen
    this.server.to(`tenant:${slug}:kitchen`).emit('order:status', {
      orderId,
      status,
      tableLabel,
      timestamp: new Date().toISOString(),
    });
  }

  emitNewOrder(slug: string, orderData: Record<string, unknown>) {
    // Notify kitchen of new order
    this.server.to(`tenant:${slug}:kitchen`).emit('order:new', {
      ...orderData,
      timestamp: new Date().toISOString(),
    });

    // Notify waiters
    this.server.to(`tenant:${slug}:waiter`).emit('order:new', {
      ...orderData,
      timestamp: new Date().toISOString(),
    });
  }

  emitOrderReady(slug: string, orderId: string, tableLabel: string) {
    // Notify all waiters that an order is ready for pickup
    this.server.to(`tenant:${slug}:waiter`).emit('order:ready', {
      orderId,
      tableLabel,
      timestamp: new Date().toISOString(),
    });
  }

  emitOrderClaimed(slug: string, orderId: string, claimedBy: string) {
    // Notify all waiters that this order was claimed (remove from other waiters)
    this.server.to(`tenant:${slug}:waiter`).emit('order:claimed', {
      orderId,
      claimedBy,
      timestamp: new Date().toISOString(),
    });
  }

  emitWaiterCall(slug: string, callData: { callId: string; tableLabel: string; tableCode: string }) {
    this.server.to(`tenant:${slug}:waiter`).emit('waiter:call', {
      ...callData,
      timestamp: new Date().toISOString(),
    });
  }

  emitWaiterCallAcknowledged(slug: string, callId: string, sessionId: string) {
    // Notify customer that waiter acknowledged
    this.server.to(`session:${sessionId}`).emit('waiter:acknowledged', {
      callId,
      timestamp: new Date().toISOString(),
    });
  }

  emitToSession(sessionId: string, event: string, data: unknown) {
    this.server.to(`session:${sessionId}`).emit(event, data);
  }
}
