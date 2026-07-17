import type { StaffMessageDto } from '@restaurant/shared-types';

export function unreadIncomingMessageIds(messages: StaffMessageDto[], myUserId: string): string[] {
  if (!myUserId) return [];
  return messages
    .filter(
      (message) =>
        message.fromRole === 'staff' && message.staffId !== myUserId && message.readAt == null,
    )
    .map((message) => message.id);
}
