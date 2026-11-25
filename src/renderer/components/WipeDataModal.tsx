import { useState } from "react";

interface WipeDataModalProps {
  onClose: () => void;
}

export default function WipeDataModal({ onClose }: WipeDataModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function wipe() {
    setBusy(true);
    setError("");
    try {
      await window.api.wipeData();
      onClose();
    } catch {
      setError("Paperweight could not delete all local data. Close other programs using these files and try again.");
    } finally { setBusy(false); }
  }
  return (
    <dialog className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg">Wipe all data?</h3>
        <p className="py-4">
          This will permanently delete <strong>all accounts</strong>, synced emails,
          credentials, settings, and your license. This action cannot be undone.
        </p>
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="modal-action">
          <button className="btn btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn-error" disabled={busy} onClick={() => { void wipe(); }}>
            {busy ? <span className="loading loading-spinner loading-xs" /> : "Wipe everything"}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button disabled={busy} onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}
