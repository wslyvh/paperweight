import { useState, useRef, useEffect } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { findPresetById, PROVIDER_PRESETS } from "@shared/email-providers";
import type { ProviderPreset } from "@shared/email-providers";

// ── Logos ─────────────────────────────────────────────────────────────────────

export function GoogleLogo(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function MicrosoftLogo(): JSX.Element {
  return (
    <svg viewBox="0 0 21 21" className="w-5 h-5">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function AppleLogo(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export function ProtonLogo(): JSX.Element {
  return (
    <svg viewBox="0 0 36 36" className="w-4 h-4" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M1 16.8C1 7.52162 8.52162 0 17.8 0C27.0784 0 34.6 7.52162 34.6 16.8V33C34.6 34.6569 33.2569 36 31.6 36H27.4L4.6 32.4L1 18V16.8ZM27.4 16.8C27.4 11.4981 23.1019 7.2 17.8 7.2C12.4981 7.2 8.2 11.4981 8.2 16.8L15.4294 23.1257C16.7867 24.3133 18.8133 24.3133 20.1706 23.1257L24.9853 22.3629L27.4 16.8Z" fill="url(#proton-grad0)" />
      <path d="M1 18L11.2402 26.7773C12.5958 27.9392 14.5981 27.9321 15.9453 26.7606L27.4 16.8V36H4C2.34315 36 1 34.6569 1 33V18Z" fill="url(#proton-grad1)" />
      <defs>
        <radialGradient id="proton-grad0" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(32.6204 38.9636) rotate(-138.788) scale(42.0132 34.2426)">
          <stop stopColor="#E2DBFF" />
          <stop offset="1" stopColor="#6D4AFF" />
        </radialGradient>
        <linearGradient id="proton-grad1" x1="14.3512" y1="26.5887" x2="5.56632" y2="45.8192" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6D4AFF" />
          <stop offset="1" stopColor="#28B0E8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Provider Select ──────────────────────────────────────────────────────────

export function ProviderSelect({
  onGmail,
  onMicrosoft,
  onApple,
  onProton,
  onImap,
}: {
  onGmail: () => void;
  onMicrosoft: () => void;
  onApple: () => void;
  onProton: () => void;
  onImap: () => void;
}): JSX.Element {
  return (
    <div className="space-y-4">
      <button
        className="btn btn-outline btn-block justify-start gap-3"
        onClick={onGmail}
      >
        <GoogleLogo />
        Connect with Google
      </button>

      <button
        className="btn btn-outline btn-block justify-start gap-3"
        onClick={onMicrosoft}
      >
        <MicrosoftLogo />
        Connect with Microsoft
      </button>

      <button
        className="btn btn-outline btn-block justify-start gap-3"
        onClick={onApple}
      >
        <AppleLogo />
        Connect with Apple
      </button>

      <button
        className="btn btn-outline btn-block justify-start gap-3"
        onClick={onProton}
      >
        <ProtonLogo />
        Connect with Proton Mail
      </button>

      <div className="divider">OR</div>

      <button
        className="btn btn-ghost btn-block justify-start gap-3"
        onClick={onImap}
      >
        <Mail className="w-5 h-5" aria-hidden="true" />
        Other email (IMAP)
      </button>
    </div>
  );
}

// ── Gmail Connect ─────────────────────────────────────────────────────────────

export function GmailConnect({
  onSuccess,
  onBack,
}: {
  onSuccess: () => void;
  onBack: () => void;
}): JSX.Element {
  const [step, setStep] = useState<"authorizing" | "success" | "error">(
    "authorizing",
  );
  const [error, setError] = useState("");
  const attemptRef = useRef(0);

  const handleConnect = async (): Promise<void> => {
    const thisAttempt = ++attemptRef.current;
    setStep("authorizing");
    setError("");

    const result = await window.api.startGmailAuth();

    if (attemptRef.current !== thisAttempt) return;

    if (result.success) {
      setStep("success");
      window.api.startSync();
      setTimeout(onSuccess, 1000);
    } else {
      setError(result.error || "Authorization failed");
      setStep("error");
    }
  };

  useEffect(() => {
    if (attemptRef.current !== 0) return;
    handleConnect();
  }, []);

  return (
    <div className="space-y-4">
      {step === "authorizing" && (
        <>
          <div className="alert alert-warning text-xs text-left">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="h-6 w-6 shrink-0 stroke-current">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>
              Google verification is still pending. If you see a warning page,
              click{" "}
              <span className="font-medium">Advanced</span> then{" "}
              <span className="font-medium">
                Go to Paperweight (unsafe)
              </span>.
            </span>
          </div>

          <div className="flex flex-col items-center gap-4 py-10">
            <span className="loading loading-spinner loading-lg"></span>
            <div className="text-center mt-2">
              <p className="text-sm">Complete sign-in in your browser...</p>
              <p className="text-xs text-base-content/50 mt-1">
                Waiting for Google authorization
              </p>
            </div>
            <div className="flex gap-3 mt-6 w-full">
              <button className="btn btn-outline flex-1" onClick={handleConnect}>
                Retry
              </button>
              <button
                className="btn btn-ghost flex-1"
                onClick={() => {
                  attemptRef.current++;
                  onBack();
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {step === "success" && (
        <div className="flex flex-col items-center gap-4 py-10">
          <div className="text-success">
            <CheckCircle2 className="w-12 h-12" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">Connected successfully!</p>
          <p className="text-xs text-base-content/50">
            Starting initial sync...
          </p>
        </div>
      )}

      {step === "error" && (
        <div className="space-y-4 py-6">
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
          <div className="flex gap-3 w-full">
            <button className="btn btn-outline flex-1" onClick={handleConnect}>
              Try Again
            </button>
            <button className="btn btn-ghost flex-1" onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Microsoft Connect ─────────────────────────────────────────────────────────

export function MicrosoftConnect({
  onSuccess,
  onBack,
}: {
  onSuccess: () => void;
  onBack: () => void;
}): JSX.Element {
  const [step, setStep] = useState<"authorizing" | "success" | "error">(
    "authorizing",
  );
  const [error, setError] = useState("");
  const attemptRef = useRef(0);

  const handleConnect = async (): Promise<void> => {
    const thisAttempt = ++attemptRef.current;
    setStep("authorizing");
    setError("");

    const result = await window.api.startMicrosoftAuth();

    if (attemptRef.current !== thisAttempt) return;

    if (result.success) {
      setStep("success");
      window.api.startSync();
      setTimeout(onSuccess, 1000);
    } else {
      setError(result.error || "Authorization failed");
      setStep("error");
    }
  };

  useEffect(() => {
    if (attemptRef.current !== 0) return;
    handleConnect();
  }, []);

  return (
    <div className="space-y-4">
      {step === "authorizing" && (
        <div className="flex flex-col items-center gap-4 py-10">
          <span className="loading loading-spinner loading-lg"></span>
          <div className="text-center mt-2">
            <p className="text-sm">Complete sign-in in your browser...</p>
            <p className="text-xs text-base-content/50 mt-1">
              Waiting for Microsoft authorization
            </p>
          </div>
          <div className="flex gap-3 mt-6 w-full">
            <button className="btn btn-outline flex-1" onClick={handleConnect}>
              Retry
            </button>
            <button
              className="btn btn-ghost flex-1"
              onClick={() => {
                attemptRef.current++;
                onBack();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "success" && (
        <div className="flex flex-col items-center gap-4 py-10">
          <div className="text-success">
            <CheckCircle2 className="w-12 h-12" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">Connected successfully!</p>
          <p className="text-xs text-base-content/50">
            Starting initial sync...
          </p>
        </div>
      )}

      {step === "error" && (
        <div className="space-y-4 py-6">
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
          <div className="flex gap-3 w-full">
            <button className="btn btn-outline flex-1" onClick={handleConnect}>
              Try Again
            </button>
            <button className="btn btn-ghost flex-1" onClick={onBack}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Server Row (compact IMAP/SMTP editor) ────────────────────────────────

function ServerRow({
  label,
  host,
  port,
  tls,
  onHost,
  onPort,
  onTls,
}: {
  label: string;
  host: string;
  port: number;
  tls: boolean;
  onHost: (v: string) => void;
  onPort: (v: number) => void;
  onTls: (v: boolean) => void;
}): JSX.Element {
  return (
    <div>
      <p className="text-xs font-medium text-base-content/60 uppercase tracking-wide mb-1.5">
        {label}
      </p>
      <div className="flex gap-2 items-center">
        <input
          type="text"
          className="input input-bordered input-sm flex-1 min-w-0"
          placeholder="Host"
          value={host}
          onChange={(e) => onHost(e.target.value)}
          required
        />
        <input
          type="number"
          className="input input-bordered input-sm w-20"
          placeholder="Port"
          value={port}
          onChange={(e) => onPort(parseInt(e.target.value, 10))}
          required
        />
        <label
          className="flex items-center gap-1.5 cursor-pointer select-none shrink-0"
          title="Implicit TLS"
        >
          <input
            type="checkbox"
            className="toggle toggle-primary toggle-sm"
            checked={tls}
            onChange={(e) => onTls(e.target.checked)}
          />
          <span className="text-xs">TLS</span>
        </label>
      </div>
    </div>
  );
}

// ── Apple / iCloud Connect ───────────────────────────────────────────────

export function AppleConnect({
  onSuccess,
  onBack,
}: {
  onSuccess: () => void;
  onBack: () => void;
}): JSX.Element {
  const preset = findPresetById("apple")!;
  const [host, setHost] = useState(preset.imap.host);
  const [port, setPort] = useState(preset.imap.port);
  const [tls, setTls] = useState(preset.imap.tls);
  const [smtpHost, setSmtpHost] = useState(preset.smtp.host);
  const [smtpPort, setSmtpPort] = useState(preset.smtp.port);
  const [smtpTls, setSmtpTls] = useState(preset.smtp.tls);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await window.api.saveImapConfig({
      host,
      port,
      tls,
      allowSelfSigned: preset.allowSelfSigned ?? false,
      username,
      password,
      smtp: { host: smtpHost, port: smtpPort, tls: smtpTls },
    });
    setLoading(false);

    if (result.success) {
      window.api.startSync();
      onSuccess();
    } else {
      setError(result.error || "Connection failed");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="alert text-xs text-left">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="h-6 w-6 shrink-0 stroke-current">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div>
          <p>
            iCloud Mail requires third-party email access to connect over IMAP.
            This requires an app-specific password.{" "}
            {preset.supportUrl && (
              <a
                href={preset.supportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                Read more
              </a>
            )}
          </p>
          {preset.appSpecificPasswordUrl && (
            <p className="text-xs text-base-content mt-2">
              <a
                href={preset.appSpecificPasswordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                Sign in to your Apple Account
              </a>
              {" > "} Sign-In and Security &gt; to generate one.
            </p>
          )}
        </div>
      </div>

      <details className="collapse collapse-arrow border border-base-300 rounded-lg">
        <summary className="collapse-title text-xs font-medium py-2 min-h-0">
          Server Settings
        </summary>
        <div className="collapse-content space-y-3 pb-3">
          <ServerRow
            label="IMAP"
            host={host}
            port={port}
            tls={tls}
            onHost={setHost}
            onPort={setPort}
            onTls={setTls}
          />
          <ServerRow
            label="SMTP"
            host={smtpHost}
            port={smtpPort}
            tls={smtpTls}
            onHost={setSmtpHost}
            onPort={setSmtpPort}
            onTls={setSmtpTls}
          />
        </div>
      </details>

      <div className="space-y-2">
        <label className="text-sm font-medium">Apple ID Email</label>
        <input
          type="text"
          className="input input-bordered w-full"
          placeholder="you@icloud.com"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">App-Specific Password</label>
        <input
          type="password"
          className="input input-bordered w-full"
          placeholder="xxxx-xxxx-xxxx-xxxx"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error && (
        <div className="alert alert-error text-sm">
          <span className="whitespace-pre-line">{error}</span>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="btn btn-primary flex-1"
          disabled={loading}
        >
          {loading ? <><span className="loading loading-spinner loading-xs" /> Connecting...</> : "Connect"}
        </button>
        <button type="button" className="btn btn-ghost flex-1" onClick={onBack}>
          Back
        </button>
      </div>
    </form>
  );
}

// ── Proton Mail Connect ──────────────────────────────────────────────────

export function ProtonConnect({
  onSuccess,
  onBack,
}: {
  onSuccess: () => void;
  onBack: () => void;
}): JSX.Element {
  const preset = findPresetById("proton")!;
  const [host, setHost] = useState(preset.imap.host);
  const [port, setPort] = useState(preset.imap.port);
  const [tls, setTls] = useState(preset.imap.tls);
  const [smtpHost, setSmtpHost] = useState(preset.smtp.host);
  const [smtpPort, setSmtpPort] = useState(preset.smtp.port);
  const [smtpTls, setSmtpTls] = useState(preset.smtp.tls);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await window.api.saveImapConfig({
      host,
      port,
      tls,
      allowSelfSigned: preset.allowSelfSigned ?? false,
      username,
      password,
      smtp: { host: smtpHost, port: smtpPort, tls: smtpTls },
    });
    setLoading(false);

    if (result.success) {
      window.api.startSync();
      onSuccess();
    } else {
      setError(result.error || "Connection failed");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="alert text-xs text-left">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="h-6 w-6 shrink-0 stroke-current">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div>
          <p>
            Proton Mail connects over IMAP via{" "}
            {preset.supportUrl ? (
              <a
                href={preset.supportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                Proton Bridge
              </a>
            ) : (
              "Proton Bridge"
            )}
            , which must be running to sync.
          </p>
        </div>
      </div>

      <details className="collapse collapse-arrow border border-base-300 rounded-lg">
        <summary className="collapse-title text-xs font-medium py-2 min-h-0">
          Server Settings
        </summary>
        <div className="collapse-content space-y-3 pb-3">
          <ServerRow
            label="IMAP"
            host={host}
            port={port}
            tls={tls}
            onHost={setHost}
            onPort={setPort}
            onTls={setTls}
          />
          <ServerRow
            label="SMTP"
            host={smtpHost}
            port={smtpPort}
            tls={smtpTls}
            onHost={setSmtpHost}
            onPort={setSmtpPort}
            onTls={setSmtpTls}
          />
        </div>
      </details>

      <div className="space-y-2">
        <label className="text-sm font-medium">Proton Email</label>
        <input
          type="text"
          className="input input-bordered w-full"
          placeholder="you@proton.me"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Bridge Password</label>
        <input
          type="password"
          className="input input-bordered w-full"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error && (
        <div className="alert alert-error text-sm">
          <span className="whitespace-pre-line">{error}</span>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="btn btn-primary flex-1"
          disabled={loading}
        >
          {loading ? <><span className="loading loading-spinner loading-xs" /> Connecting...</> : "Connect"}
        </button>
        <button type="button" className="btn btn-ghost flex-1" onClick={onBack}>
          Back
        </button>
      </div>
    </form>
  );
}

// ── IMAP Connect ──────────────────────────────────────────────────────────────

interface FormState {
  host: string;
  port: number;
  tls: boolean;
  allowSelfSigned: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpTls: boolean;
}

function matchesPreset(preset: ProviderPreset, s: FormState): boolean {
  return (
    preset.imap.host === s.host &&
    preset.imap.port === s.port &&
    preset.imap.tls === s.tls &&
    (preset.allowSelfSigned ?? false) === s.allowSelfSigned &&
    preset.smtp.host === s.smtpHost &&
    preset.smtp.port === s.smtpPort &&
    preset.smtp.tls === s.smtpTls
  );
}

export function ImapConnect({
  onSuccess,
  onBack,
}: {
  onSuccess: () => void;
  onBack: () => void;
}): JSX.Element {
  const [presetId, setPresetId] = useState("custom");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(993);
  const [tls, setTls] = useState(true);
  const [allowSelfSigned, setAllowSelfSigned] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpTls, setSmtpTls] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const preset = findPresetById(presetId);

  const applyPreset = (id: string): void => {
    setPresetId(id);
    const p = findPresetById(id);
    if (p) {
      setHost(p.imap.host);
      setPort(p.imap.port);
      setTls(p.imap.tls);
      setAllowSelfSigned(p.allowSelfSigned ?? false);
      setSmtpHost(p.smtp.host);
      setSmtpPort(p.smtp.port);
      setSmtpTls(p.smtp.tls);
    }
  };

  const checkDrift = (next: Partial<FormState>): void => {
    if (!preset) return;
    const state: FormState = {
      host, port, tls, allowSelfSigned, smtpHost, smtpPort, smtpTls, ...next,
    };
    if (!matchesPreset(preset, state)) setPresetId("custom");
  };

  const updateHost = (v: string): void => { setHost(v); checkDrift({ host: v }); };
  const updatePort = (v: number): void => { setPort(v); checkDrift({ port: v }); };
  const updateTls = (v: boolean): void => { setTls(v); checkDrift({ tls: v }); };
  const updateAllowSelfSigned = (v: boolean): void => { setAllowSelfSigned(v); checkDrift({ allowSelfSigned: v }); };
  const updateSmtpHost = (v: string): void => { setSmtpHost(v); checkDrift({ smtpHost: v }); };
  const updateSmtpPort = (v: number): void => { setSmtpPort(v); checkDrift({ smtpPort: v }); };
  const updateSmtpTls = (v: boolean): void => { setSmtpTls(v); checkDrift({ smtpTls: v }); };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await window.api.saveImapConfig({
      host,
      port,
      tls,
      allowSelfSigned,
      username,
      password,
      smtp: { host: smtpHost, port: smtpPort, tls: smtpTls },
    });
    setLoading(false);

    if (result.success) {
      window.api.startSync();
      onSuccess();
    } else {
      setError(result.error || "Connection failed");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <label className="text-sm font-medium">Provider</label>
        <select
          className="select select-bordered w-full"
          value={presetId}
          onChange={(e) => applyPreset(e.target.value)}
        >
          <option value="custom">Custom / Other</option>
          {PROVIDER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {preset && (preset.appSpecificPasswordUrl || preset.notes || preset.supportUrl) && (
        <div className="alert text-xs text-left">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="h-6 w-6 shrink-0 stroke-current">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <div>
            {preset.appSpecificPasswordUrl && (
              <p>
                {preset.name} requires an app-specific password for third-party email access.{" "}
                {preset.supportUrl && (
                  <a
                    href={preset.supportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link"
                  >
                    Read more
                  </a>
                )}
              </p>
            )}
            {!preset.appSpecificPasswordUrl && preset.supportUrl && (
              <p>
                <a
                  href={preset.supportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  {preset.name} setup guide
                </a>
              </p>
            )}
            {preset.appSpecificPasswordUrl && (
              <p className="text-xs text-base-content mt-2">
                <a
                  href={preset.appSpecificPasswordUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  Generate an app-specific password
                </a>
              </p>
            )}
            {preset.notes && (
              <p className="text-xs text-base-content mt-2">{preset.notes}</p>
            )}
          </div>
        </div>
      )}

      <ServerRow
        label="IMAP"
        host={host}
        port={port}
        tls={tls}
        onHost={updateHost}
        onPort={updatePort}
        onTls={updateTls}
      />

      <label className="flex items-center gap-2 cursor-pointer select-none -mt-1">
        <input
          type="checkbox"
          className="toggle toggle-primary toggle-sm"
          checked={allowSelfSigned}
          onChange={(e) => updateAllowSelfSigned(e.target.checked)}
        />
        <span className="text-xs">Allow self-signed certificate</span>
      </label>

      <ServerRow
        label="SMTP"
        host={smtpHost}
        port={smtpPort}
        tls={smtpTls}
        onHost={updateSmtpHost}
        onPort={updateSmtpPort}
        onTls={updateSmtpTls}
      />

      <div className="space-y-2">
        <label className="text-sm font-medium">Email / Username</label>
        <input
          type="text"
          className="input input-bordered w-full"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Password</label>
        <input
          type="password"
          className="input input-bordered w-full"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error && (
        <div className="alert alert-error text-sm">
          <span className="whitespace-pre-line">{error}</span>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="btn btn-primary flex-1"
          disabled={loading}
        >
          {loading ? <><span className="loading loading-spinner loading-xs" /> Connecting...</> : "Connect"}
        </button>
        <button type="button" className="btn btn-ghost flex-1" onClick={onBack}>
          Back
        </button>
      </div>
    </form>
  );
}
