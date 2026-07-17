export interface SplitSummaryResponse {
  ok?: boolean;
}

/** Only resolves when the server explicitly acknowledges the summary. */
export async function sendSplitSummary(send: () => Promise<SplitSummaryResponse>): Promise<void> {
  const response = await send();
  if (response?.ok !== true) {
    throw new Error('split_summary_not_acknowledged');
  }
}
