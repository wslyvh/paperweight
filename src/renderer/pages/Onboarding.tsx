import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { HelpCircle, Search, Trash2, Globe } from "lucide-react";
import type { SupportInfo } from "@shared/types";
import DeviceInfoCard from "../components/DeviceInfoCard";
import HelpSection from "../components/HelpSection";
import {
  ProviderSelect,
  GmailConnect,
  MicrosoftConnect,
  AppleConnect,
  ProtonConnect,
  ImapConnect,
} from "../components/ProviderConnect";

// ── Carousel ─────────────────────────────────────────────────────────────────

const slides = [
  {
    icon: <Search className="w-10 h-10" />,
    title: "Analyse your inbox",
    description:
      "Paperweight scans your emails and organises them into two views: Mailing Lists (newsletters and subscriptions) and Accounts (every company that has your data). Start with Mailing Lists. That's where most people find the most to clean up.",
  },
  {
    icon: <Trash2 className="w-10 h-10" />,
    title: "Clear the clutter",
    description:
      "Review your mailing lists by volume. Unsubscribe from anything you haven't opened in a month. For senders that support one-click unsubscribe, Paperweight handles it automatically. Others will open the sender's unsubscribe page for you.",
  },
  {
    icon: <Globe className="w-10 h-10" />,
    title: "Manage your footprint",
    description:
      "The Accounts tab shows every company holding your data. For ones you no longer use, you can send a GDPR deletion request directly from Paperweight. We pre-fill it with your account details.",
  },
];

function OnboardingCarousel(): JSX.Element {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setActive((i) => (i + 1) % slides.length),
      5000,
    );
    return () => clearInterval(id);
  }, []);

  const slide = slides[active];

  return (
    <div className="flex flex-col items-center text-center max-w-sm">
      <div className="mb-6 opacity-80 text-4xl">{slide.icon}</div>
      <h3 className="text-2xl font-bold mb-3">{slide.title}</h3>
      <p className="text-sm opacity-70 leading-relaxed">{slide.description}</p>
      <div className="flex gap-1 mt-8">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className="p-2 flex items-center"
          >
            <span
              className={`block h-2.5 rounded-full transition-all duration-300 ${
                i === active
                  ? "w-8 bg-primary-content"
                  : "w-2.5 bg-primary-content/40"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function Onboarding(): JSX.Element {
  const navigate = useNavigate();
  const [view, setView] = useState<
    "select" | "gmail" | "microsoft" | "apple" | "proton" | "imap"
  >("select");
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [supportInfo, setSupportInfo] = useState<SupportInfo>();

  // If the page reloads while on /onboarding (e.g. after accountSwitched fires)
  // and credentials are already present, redirect straight to dashboard.
  useEffect(() => {
    window.api.getConnectionStatus().then((connected) => {
      if (connected) navigate("/dashboard", { replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    if (showHelpModal) {
      window.api.getSupportInfo().then(setSupportInfo);
    }
  }, [showHelpModal]);

  const handleSuccess = (): void => {
    navigate("/dashboard");
  };

  return (
    <div className="flex h-screen bg-base-100">
      {/* Left panel */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 overflow-y-auto">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Get Started</h2>
              <p className="text-base-content/60 text-sm mt-1">
                Connect your email account
              </p>
            </div>
            <button
              className="btn btn-ghost btn-sm btn-square shrink-0"
              onClick={() => setShowHelpModal(true)}
              title="Help & device info"
              aria-label="Help & device info"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>

          {view === "select" && (
            <ProviderSelect
              onGmail={() => setView("gmail")}
              onMicrosoft={() => setView("microsoft")}
              onApple={() => setView("apple")}
              onProton={() => setView("proton")}
              onImap={() => setView("imap")}
            />
          )}
          {view === "gmail" && (
            <GmailConnect
              onSuccess={handleSuccess}
              onBack={() => setView("select")}
            />
          )}
          {view === "microsoft" && (
            <MicrosoftConnect
              onSuccess={handleSuccess}
              onBack={() => setView("select")}
            />
          )}
          {view === "apple" && (
            <AppleConnect
              onSuccess={handleSuccess}
              onBack={() => setView("select")}
            />
          )}
          {view === "proton" && (
            <ProtonConnect
              onSuccess={handleSuccess}
              onBack={() => setView("select")}
            />
          )}
          {view === "imap" && (
            <ImapConnect
              onSuccess={handleSuccess}
              onBack={() => setView("select")}
            />
          )}
        </div>
      </div>

      {/* Help modal */}
      {showHelpModal && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-lg">Help</h3>
            <div className="space-y-6 py-4">
              <DeviceInfoCard info={supportInfo} variant="plain" />
              <HelpSection variant="plain" />
            </div>
            <div className="modal-action">
              <button
                className="btn btn-primary"
                onClick={() => setShowHelpModal(false)}
              >
                Close
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowHelpModal(false)}>close</button>
          </form>
        </dialog>
      )}

      {/* Right panel */}
      <div className="flex-1 bg-primary text-primary-content flex items-center justify-center p-12">
        <OnboardingCarousel />
      </div>
    </div>
  );
}
