export interface OrderActionResult {
  succeededIds: string[];
  failedIds: string[];
}

/**
 * Run a confirm/cancel request per order and retain partial-failure evidence.
 * The caller only navigates after `failedIds` is empty; retrying all ids is
 * safe because both API operations are idempotent for their terminal state.
 */
export async function runOrderAction(
  orderIds: string[],
  action: (orderId: string) => Promise<unknown>,
): Promise<OrderActionResult> {
  const ids = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))];
  const settled = await Promise.all(
    ids.map(async (id) => {
      try {
        await action(id);
        return { id, ok: true } as const;
      } catch {
        return { id, ok: false } as const;
      }
    }),
  );

  return {
    succeededIds: settled.filter((item) => item.ok).map((item) => item.id),
    failedIds: settled.filter((item) => !item.ok).map((item) => item.id),
  };
}
