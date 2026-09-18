"use client";

import { useEffect, type RefObject } from "react";

/**
 * Drive a native `<dialog class="sheet">` from a boolean prop.
 *
 * `showModal()` gives the top layer, focus trapping and Esc handling for free, and
 * keeping the node mounted lets the exit transition in globals.css actually run.
 *
 * Modelled on the wiring inside entry-modal so the receipt viewer and the mark-paid
 * prompt behave identically, in particular the Safari branch: it has no `closedby`, so
 * a click-outside has to be measured against the dialog's own box.
 *
 * entry-modal still has its own copy. It predates this and works; folding it in would
 * mean reconciling its `onClose` attribute with the `close` listener below, which is
 * churn on a working sheet for no user-visible gain.
 */
export function useSheetDialog(ref: RefObject<HTMLDialogElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open, ref]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) {
      dialog.setAttribute("closedby", "any");
    } else {
      const dismiss = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const box = dialog.getBoundingClientRect();
        const inside =
          box.top <= event.clientY && event.clientY <= box.bottom &&
          box.left <= event.clientX && event.clientX <= box.right;
        if (!inside) dialog.close();
      };
      dialog.addEventListener("click", dismiss);
      return () => dialog.removeEventListener("click", dismiss);
    }
  }, [ref]);

  // Esc and click-outside are handled by the browser, which fires `close` without
  // telling React. Mirroring it back keeps the caller's state from going stale.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const sync = () => onClose();
    dialog.addEventListener("close", sync);
    return () => dialog.removeEventListener("close", sync);
  }, [onClose, ref]);
}
