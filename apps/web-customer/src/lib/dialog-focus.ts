const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const dialogStack: symbol[] = [];

function isAvailable(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  if (element.matches(':disabled')) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style?.display === 'none' || style?.visibility === 'hidden') return false;
  return element.tabIndex >= 0;
}

export function getDialogFocusableElements(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    isAvailable,
  );
}

function focusWithoutScrolling(element: HTMLElement): void {
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

export function focusInitialDialogElement(dialog: HTMLElement): void {
  const explicit = dialog.hasAttribute('data-dialog-initial-focus')
    ? dialog
    : dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]');
  const target =
    explicit && !explicit.matches(':disabled') ? explicit : getDialogFocusableElements(dialog)[0];
  focusWithoutScrolling(target ?? dialog);
}

export function trapDialogTabKey(dialog: HTMLElement, event: KeyboardEvent): boolean {
  if (event.key !== 'Tab') return false;
  const focusable = getDialogFocusableElements(dialog);
  if (focusable.length === 0) {
    event.preventDefault();
    focusWithoutScrolling(dialog);
    return true;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const outside = !(active instanceof Node) || !dialog.contains(active);

  if (event.shiftKey && (outside || active === first)) {
    event.preventDefault();
    focusWithoutScrolling(last);
    return true;
  }
  if (!event.shiftKey && (outside || active === last)) {
    event.preventDefault();
    focusWithoutScrolling(first);
    return true;
  }
  return false;
}

/**
 * Activate one modal dialog: initial focus, Tab loop, Escape, and focus return.
 * A small stack ensures only the top-most nested dialog handles the keyboard.
 */
export function activateDialogFocus(dialog: HTMLElement, onClose: () => void): () => void {
  const token = Symbol('dialog');
  const returnTarget =
    document.activeElement instanceof HTMLElement && !dialog.contains(document.activeElement)
      ? document.activeElement
      : null;
  let active = true;
  let addedTabIndex = false;
  if (!dialog.hasAttribute('tabindex')) {
    dialog.tabIndex = -1;
    addedTabIndex = true;
  }

  dialogStack.push(token);
  focusInitialDialogElement(dialog);

  const onKeyDown = (event: KeyboardEvent) => {
    if (dialogStack[dialogStack.length - 1] !== token) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    trapDialogTabKey(dialog, event);
  };
  document.addEventListener('keydown', onKeyDown);

  return () => {
    if (!active) return;
    active = false;
    document.removeEventListener('keydown', onKeyDown);
    const index = dialogStack.lastIndexOf(token);
    if (index >= 0) dialogStack.splice(index, 1);
    if (addedTabIndex) dialog.removeAttribute('tabindex');
    if (returnTarget?.isConnected) focusWithoutScrolling(returnTarget);
  };
}
