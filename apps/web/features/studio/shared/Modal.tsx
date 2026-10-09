"use client";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
export function Modal({
  title,
  onClose,
  children,
  closeDisabled = false,
  restoreFocusTo,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeDisabled?: boolean;
  restoreFocusTo?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    // An async save may disable the trigger before this modal mounts, moving
    // focus to body. Preserve the explicit media trigger in that case.
    const restore =
      restoreFocusTo?.current ?? (document.activeElement as HTMLElement | null);
    const dialog = ref.current;
    if (!dialog) return;
    let resumeFocus: HTMLElement | null = null;
    // A modal is in the top layer: hiding an ancestor alone is insufficient.
    // Close it while authority is suspended, retaining its mounted editor.
    const syncVisibility = () => {
      if (dialog.closest("[hidden], [inert]")) {
        if (dialog.open) {
          if (dialog.contains(document.activeElement))
            resumeFocus = document.activeElement as HTMLElement;
          dialog.close();
        }
      } else if (!dialog.open) {
        dialog.showModal();
        if (resumeFocus?.isConnected) resumeFocus.focus();
      }
    };
    const observer = new MutationObserver(syncVisibility);
    for (
      let ancestor = dialog.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    )
      observer.observe(ancestor, {
        attributes: true,
        attributeFilter: ["hidden", "inert"],
      });
    syncVisibility();
    return () => {
      observer.disconnect();
      dialog.close();
      restore?.focus();
    };
  }, [restoreFocusTo]);
  return (
    <dialog
      ref={ref}
      className="qv w5-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
    >
      <div className="w5-row">
        <h2>{title}</h2>
        <button
          className="qv-btn qv-btn--quiet"
          disabled={closeDisabled}
          onClick={onClose}
        >
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}
