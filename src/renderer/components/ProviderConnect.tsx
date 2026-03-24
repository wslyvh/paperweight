import { useState, useRef, useEffect } from "react";
import { CheckCircle2, Mail } from "lucide-react";

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

// ── Provider Select ──────────────────────────────────────────────────────────

export function ProviderSelect({
  onGmail,
  onMicrosoft,
  onImap,
}: {
  onGmail: () => void;
  onMicrosoft: () => void;
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
        disabled
      >
        <AppleLogo />
        Connect with Apple
        <span className="badge badge-ghost badge-xs ml-auto">Soon</span>
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

// ── Gmail Notice ─────────────────────────────────────────────────────────────

export function GmailNotice({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}): JSX.Element {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Google verification pending</h3>
        <p className="text-sm text-base-content/70 leading-relaxed">
          Paperweight is awaiting Google's verification process. You'll see a
          warning screen — click{" "}
          <span className="font-medium text-base-content">Advanced</span> then{" "}
          <span className="font-medium text-base-content">
            Go to Paperweight (unsafe)
          </span>{" "}
          to continue.
        </p>
      </div>

      <div className="alert text-xs">
        <span>
          Paperweight is{" "}
          <a
            href="https://github.com/wslyvh/paperweight"
            className="link"
            target="_blank"
            rel="noreferrer"
          >
            open source
          </a>
          . You can review exactly what the app does with your account before
          connecting.
        </span>
      </div>

      <div className="flex gap-3">
        <button className="btn btn-primary flex-1" onClick={onContinue}>
          Continue
        </button>
        <button className="btn btn-ghost flex-1" onClick={onBack}>
          Back
        </button>
      </div>
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

// ── IMAP Connect ──────────────────────────────────────────────────────────────

export function ImapConnect({
  onSuccess,
  onBack,
}: {
  onSuccess: () => void;
  onBack: () => void;
}): JSX.Element {
  const [host, setHost] = useState("");
  const [port, setPort] = useState(993);
  const [tls, setTls] = useState(true);
  const [allowSelfSigned, setAllowSelfSigned] = useState(false);
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
      allowSelfSigned,
      username,
      password,
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
        <label className="text-sm font-medium">IMAP Host</label>
        <input
          type="text"
          className="input input-bordered w-full"
          placeholder="imap.example.com"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          required
        />
      </div>

      <div className="flex gap-3">
        <div className="space-y-2 flex-1">
          <label className="text-sm font-medium">Port</label>
          <input
            type="number"
            className="input input-bordered w-full"
            value={port}
            onChange={(e) => setPort(parseInt(e.target.value, 10))}
            required
          />
        </div>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={tls}
              onChange={(e) => setTls(e.target.checked)}
            />
            <span className="text-xs">Implicit TLS</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={allowSelfSigned}
              onChange={(e) => setAllowSelfSigned(e.target.checked)}
            />
            <span className="text-xs">Self-signed cert</span>
          </label>
        </div>
      </div>

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
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className={`btn btn-primary flex-1 ${loading ? "loading" : ""}`}
          disabled={loading}
        >
          {loading ? "Connecting..." : "Connect"}
        </button>
        <button type="button" className="btn btn-ghost flex-1" onClick={onBack}>
          Back
        </button>
      </div>
    </form>
  );
}
