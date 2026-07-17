import { sendSplitSummary } from './sendSummary';

describe('sendSplitSummary', () => {
  it('resolves only after an explicit server acknowledgement', async () => {
    await expect(sendSplitSummary(async () => ({ ok: true }))).resolves.toBeUndefined();
  });

  it('keeps the user on screen when transport fails', async () => {
    await expect(
      sendSplitSummary(async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow('offline');
  });

  it('rejects a syntactically successful response that did not acknowledge delivery', async () => {
    await expect(sendSplitSummary(async () => ({}))).rejects.toThrow(
      'split_summary_not_acknowledged',
    );
  });
});
