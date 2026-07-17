import { createQrBootstrapDeadline } from './qr-bootstrap-deadline';

describe('createQrBootstrapDeadline', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reports a stalled network bootstrap', () => {
    const onTimeout = jest.fn();
    createQrBootstrapDeadline(onTimeout, 3000);

    jest.advanceTimersByTime(3000);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not time out after bootstrap completes while a human handles geolocation', () => {
    const onTimeout = jest.fn();
    const deadline = createQrBootstrapDeadline(onTimeout, 3000);

    deadline.clear();
    jest.advanceTimersByTime(30_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });
});
