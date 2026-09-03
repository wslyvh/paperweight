import { useState } from "react";
import type { ServerConfig } from "@shared/types";
import { ServerRow } from "./ProviderConnect";

export default function ServerSettingsModal({
  email,
  initial,
  onClose,
  onSaved,
}: {
  email: string;
  initial: ServerConfig;
  onClose: () => void;
  onSaved: () => void;
}): JSX.Element {
  const [host, setHost] = useState(initial.imap.host);
  const [port, setPort] = useState(initial.imap.port);
  const [tls, setTls] = useState(initial.imap.tls);
  const [allowSelfSigned, setAllowSelfSigned] = useState(
    initial.imap.allowSelfSigned,
  );
  const [smtpHost, setSmtpHost] = useState(initial.smtp?.host ?? "");
  const [smtpPort, setSmtpPort] = useState(initial.smtp?.port ?? 465);
  const [smtpTls, setSmtpTls] = useState(initial.smtp?.tls ?? true);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = password.trim()
        ? await window.api.saveImapConfig(
            { type: "reconnect", email },
            {
              host,
              port,
              tls,
              allowSelfSigned,
              username: email,
              password,
              smtp: { host: smtpHost, port: smtpPort, tls: smtpTls },
            },
          )
        : await window.api.updateServerConfig({
            imap: { host, port, tls, allowSelfSigned },
            smtp: { host: smtpHost, port: smtpPort, tls: smtpTls },
          });

      if (result.success) {
        onSaved();
      } else {
        setError(result.error || "Failed to update server settings");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update server settings");
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg">Server Settings</h3>
        <p className="text-xs text-base-content/60 mt-1">{email}</p>

        <form onSubmit={handleSubmit} className="space-y-3 pt-4">
          <ServerRow
            label="IMAP"
            host={host}
            port={port}
            tls={tls}
            onHost={setHost}
            onPort={setPort}
            onTls={setTls}
          />

          <label className="flex items-center gap-2 cursor-pointer select-none -mt-1">
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={allowSelfSigned}
              onChange={(e) => setAllowSelfSigned(e.target.checked)}
            />
            <span className="text-xs">Allow self-signed certificate</span>
          </label>

          <ServerRow
            label="SMTP"
            host={smtpHost}
            port={smtpPort}
            tls={smtpTls}
            onHost={setSmtpHost}
            onPort={setSmtpPort}
            onTls={setSmtpTls}
          />

          <label className="form-control">
            <span className="label-text text-xs font-medium text-base-content/60 uppercase tracking-wide mb-1.5">
              New password
            </span>
            <input
              type="password"
              className="input input-bordered input-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep current password"
              autoComplete="new-password"
            />
          </label>

          {error && (
            <div className="alert alert-error text-sm">
              <span className="whitespace-pre-line">{error}</span>
            </div>
          )}

          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={loading}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-xs" /> Testing...
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}
