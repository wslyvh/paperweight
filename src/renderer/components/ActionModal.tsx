import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";

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
  cancelVariant?: "ghost" | "neutral";
  hideCancel?: boolean;
  onConfirm?: () => void | Promise<void>;
  onSecondary?: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  /** When set, shows a copy-to-clipboard button beside Cancel. */
  copyText?: string;
  /** When set, shows an error message below the modal body. */
  error?: string;
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
  cancelVariant = "ghost",
  hideCancel,
  onConfirm,
  onSecondary,
  onCancel,
  loading,
  copyText,
  error,
}: ActionModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) setCopied(false);
  }, [isOpen]);

  const handleCopy = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can reject (permission denied, unfocused document). Swallow —
      // the text is still visible for manual copy; just don't flash "Copied".
    }
  };

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
    if (loading) {
      ref.current?.showModal();
      return;
    }
    onCancel();
  };

  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => { if (loading) e.preventDefault(); }}
      onClose={handleDialogClose}
    >
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-4">{title}</h3>
        <div className="text-sm text-base-content/80 space-y-3">{children}</div>
        {error && <p className="text-error text-sm mt-3">{error}</p>}
        <div className="modal-action mt-6">
          {copyText && (
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              onClick={handleCopy}
              disabled={loading}
              title={copied ? "Copied" : "Copy to clipboard"}
            >
              <Copy className="w-4 h-4" />
            </button>
          )}
          {!hideCancel && (
            <button
              className={`btn btn-sm ${cancelVariant === "neutral" ? "btn-neutral" : "btn-ghost"}`}
              onClick={() => { if (!loading) onCancel(); }}
              disabled={loading}
            >
              {cancelLabel}
            </button>
          )}
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
        <button
          type="submit"
          disabled={loading}
          onClick={(e) => {
            if (loading) e.preventDefault();
            else onCancel();
          }}
        >
          close
        </button>
      </form>
    </dialog>
  );
}
