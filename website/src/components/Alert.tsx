"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

export type AlertTone = "success" | "error" | "warning" | "info";

interface AlertProps {
  tone: AlertTone;
  title?: string;
  message: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  dismissable?: boolean;
  onDismiss?: () => void;
  className?: string;
}

function getToneClassName(tone: AlertTone) {
  if (tone === "success") return "alert-success";
  if (tone === "error") return "alert-error";
  if (tone === "warning") return "alert-warning";
  return "alert-info";
}

function getDefaultIcon(tone: AlertTone) {
  const className = "h-5 w-5 shrink-0 stroke-current";
  if (tone === "success") return <CheckCircle2 className={className} />;
  if (tone === "error") return <XCircle className={className} />;
  if (tone === "warning") return <AlertTriangle className={className} />;
  return <Info className={className} />;
}

export function Alert(props: AlertProps) {
  const {
    tone,
    title,
    message,
    actions,
    icon,
    dismissable = false,
    onDismiss,
    className,
  } = props;

  const [isOpen, setIsOpen] = useState(true);

  const toneClassName = useMemo(() => getToneClassName(tone), [tone]);
  const iconNode = useMemo(() => icon ?? getDefaultIcon(tone), [icon, tone]);

  if (!isOpen) return null;

  return (
    <div
      role="alert"
      className={[
        "alert alert-soft alert-vertical sm:alert-horizontal border-0 shadow-none",
        toneClassName,
        "rounded-2xl",
        "items-center",
        className ?? "",
      ].join(" ")}
    >
      {iconNode}
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        {title ? (
          <div className="font-semibold leading-tight">{title}</div>
        ) : null}
        <div className="text-sm opacity-80 leading-tight">{message}</div>
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
      {dismissable ? (
        <button
          type="button"
          className="btn btn-ghost btn-xs rounded-full border-0 hover:bg-transparent hover:border-transparent active:bg-transparent shadow-none"
          aria-label="Sluiten"
          title="Sluiten"
          onClick={() => {
            setIsOpen(false);
            onDismiss?.();
          }}
        >
          <X className="h-4 w-4 stroke-current" />
        </button>
      ) : null}
    </div>
  );
}
