import { useEffect, useRef } from "react";

interface ActionModalProps {
  isOpen: boolean;
  title: string;
  children: React.ReactNode;
  /** Primary action label. Omit to hide the primary button. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional middle button (e.g. "No, mark as spam") */
  secondaryLabel?: string;
  confirmVariant?: "primary" | "neutral" | "error" | "warning" | "success";
  secondaryVariant?: "primary" | "neutral" | "error" | "warning" | "success";
  onConfirm?: () => void | Promise<void>;
  onSecondary?: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const VARIANT_CLASS: Record<string, string> = {
  primary: "btn-primary",
  neutral: "btn-neutral",
  error: "btn-error",
  warning: "btn-warning",
  success: "btn-success",
};

export default function ActionModal({
  isOpen,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  secondaryLabel,
  confirmVariant = "neutral",
  secondaryVariant = "warning",
  onConfirm,
  onSecondary,
  onCancel,
  loading,
}: ActionModalProps): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  const handleDialogClose = () => {
    if (!loading) onCancel();
  };

  return (
    <dialog ref={ref} className="modal" onClose={handleDialogClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-4">{title}</h3>
        <div className="text-sm text-base-content/80 space-y-3">{children}</div>
        <div className="modal-action mt-6">
          <button
            className="btn btn-ghost btn-sm"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          {secondaryLabel && (
            <button
              className={`btn btn-sm ${VARIANT_CLASS[secondaryVariant]}`}
              onClick={onSecondary}
              disabled={loading}
            >
              {loading ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                secondaryLabel
              )}
            </button>
          )}
          {confirmLabel && (
            <button
              className={`btn btn-sm ${VARIANT_CLASS[confirmVariant]}`}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                confirmLabel
              )}
            </button>
          )}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit" onClick={onCancel} disabled={loading}>
          close
        </button>
      </form>
    </dialog>
  );
}
