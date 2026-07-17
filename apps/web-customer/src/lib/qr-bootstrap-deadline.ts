export interface QrBootstrapDeadline {
  clear(): void;
}

/**
 * Deadline only for the network bootstrap that precedes the OS permission
 * prompt. Call `clear()` before asking for geolocation: a human deciding on a
 * native prompt must never lose a race against the loading splash timeout.
 */
export function createQrBootstrapDeadline(
  onTimeout: () => void,
  timeoutMs: number,
): QrBootstrapDeadline {
  let active = true;
  const handle = setTimeout(() => {
    if (!active) return;
    active = false;
    onTimeout();
  }, timeoutMs);

  return {
    clear() {
      if (!active) return;
      active = false;
      clearTimeout(handle);
    },
  };
}
