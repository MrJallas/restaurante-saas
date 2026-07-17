import { activateDialogFocus, getDialogFocusableElements } from './dialog-focus';

describe('staff dialog focus management', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses the requested initial element, traps Tab, handles Escape, and returns focus', () => {
    document.body.innerHTML = `
      <button id="trigger">Abrir</button>
      <section id="dialog" tabindex="-1">
        <button id="first" data-dialog-initial-focus>Primeiro</button>
        <button id="last">Ultimo</button>
      </section>`;
    const trigger = document.querySelector<HTMLElement>('#trigger')!;
    const dialog = document.querySelector<HTMLElement>('#dialog')!;
    const first = document.querySelector<HTMLElement>('#first')!;
    const last = document.querySelector<HTMLElement>('#last')!;
    const onClose = jest.fn();
    trigger.focus();

    const deactivate = activateDialogFocus(dialog, onClose);
    expect(document.activeElement).toBe(first);
    expect(getDialogFocusableElements(dialog)).toEqual([first, last]);

    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);

    first.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(document.activeElement).toBe(last);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    deactivate();
    expect(document.activeElement).toBe(trigger);
  });

  it('lets only the top-most nested dialog consume Escape', () => {
    document.body.innerHTML = `
      <section id="parent"><button>Parent</button></section>
      <section id="child"><button>Child</button></section>`;
    const closeParent = jest.fn();
    const closeChild = jest.fn();
    const deactivateParent = activateDialogFocus(
      document.querySelector<HTMLElement>('#parent')!,
      closeParent,
    );
    const deactivateChild = activateDialogFocus(
      document.querySelector<HTMLElement>('#child')!,
      closeChild,
    );

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closeChild).toHaveBeenCalledTimes(1);
    expect(closeParent).not.toHaveBeenCalled();

    deactivateChild();
    deactivateParent();
  });

  it('focuses the dialog surface when there is no interactive control', () => {
    document.body.innerHTML = '<section id="dialog"><p>Sem controles</p></section>';
    const dialog = document.querySelector<HTMLElement>('#dialog')!;
    const deactivate = activateDialogFocus(dialog, jest.fn());

    expect(document.activeElement).toBe(dialog);
    expect(dialog.tabIndex).toBe(-1);

    deactivate();
    expect(dialog.hasAttribute('tabindex')).toBe(false);
  });
});
