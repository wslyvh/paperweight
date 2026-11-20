interface HelpSectionProps {
  /** Use card styling (Support page) vs plain (modal) */
  variant?: "card" | "plain";
}

export default function HelpSection({
  variant = "card",
}: HelpSectionProps) {
  const links = (
    <div className="flex flex-col gap-2 text-sm">
      <button
        className="link link-primary w-fit"
        onClick={() =>
          window.api.openExternal(
            "https://github.com/wslyvh/paperweight/issues"
          )
        }
      >
        Report an issue on GitHub
      </button>
      <button
        className="link link-primary w-fit"
        onClick={() =>
          window.api.openExternal("mailto:hello@paperweight.email")
        }
      >
        Contact hello@paperweight.email
      </button>
    </div>
  );

  if (variant === "plain") {
    return (
      <div className="space-y-3">
        <h3 className="font-semibold">Help</h3>
        {links}
      </div>
    );
  }

  return (
    <div className="card bg-base-200">
      <div className="card-body space-y-3">
        <h3 className="font-semibold">Help</h3>
        {links}
      </div>
    </div>
  );
}
