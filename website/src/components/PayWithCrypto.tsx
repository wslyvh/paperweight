"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { useCoinPrices, type CoinId, type CoinPrices } from "@/hooks/useCoinPrices";
import { PAYMENT_ADDRESSES } from "@/utils/payments";
import { SITE_CONFIG } from "@/utils/config";

type PaymentCoinId = "ethereum" | "bitcoin" | "zcash" | "monero";

const PAYMENT_COINS: { id: PaymentCoinId; label: string }[] = [
  { id: "ethereum", label: "Ethereum" },
  { id: "bitcoin", label: "Bitcoin" },
  { id: "zcash", label: "Zcash" },
  { id: "monero", label: "Monero" },
];

export interface PayWithCryptoPricing {
  priceUsd: number;
  /** When set, shows an event-week promo footnote in the modal header. */
  eventLabel?: string;
}

interface PayWithCryptoPanelProps {
  pricing: PayWithCryptoPricing;
  supportEmail?: string;
  showHeader?: boolean;
  className?: string;
}

interface PayWithCryptoDialogProps extends PayWithCryptoPanelProps {
  open: boolean;
  onClose: () => void;
}

interface PayWithCryptoButtonProps {
  pricing: PayWithCryptoPricing;
  supportEmail?: string;
  className?: string;
  analyticsEvent?: string;
  children: ReactNode;
}

interface PaymentPanelContentProps {
  description: ReactNode;
  address: string;
  symbol: string;
  loading: boolean;
  amount?: string;
  spotPrice?: number;
  footnote?: ReactNode;
}

function formatUsd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  });
}

function CopyIconButton(props: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(props.value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy value", error);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-xs btn-square shrink-0 opacity-50 hover:opacity-100"
      onClick={copy}
      aria-label={props.label}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function CopyField(props: { value: string; displayValue?: string; label: string }) {
  const display = props.displayValue ?? props.value;

  return (
    <div className="relative">
      <input
        type="text"
        readOnly
        value={display}
        className="input input-bordered input-sm w-full pr-9 font-mono text-xs opacity-90"
        aria-label={props.label}
      />
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
        <CopyIconButton value={props.value} label={`Copy ${props.label.toLowerCase()}`} />
      </div>
    </div>
  );
}

function PaymentPanelContent(props: PaymentPanelContentProps) {
  const amountDisplay = props.loading
    ? "Fetching rate…"
    : props.amount
      ? `≈ ${props.amount} ${props.symbol}`
      : "—";

  return (
    <div className="flex flex-col gap-2">
      <div className="min-h-[2.75rem] text-sm leading-snug text-base-content/75">
        {props.description}
      </div>

      <CopyField
        value={props.amount ?? ""}
        displayValue={amountDisplay}
        label={`${props.symbol} amount`}
      />
      <CopyField value={props.address} label="Address" />

      <p className="min-h-4 text-xs text-base-content/60">
        {props.loading ? (
          "Fetching rate…"
        ) : props.spotPrice ? (
          <>
            1 {props.symbol} = {formatUsd(props.spotPrice)} via{" "}
            <a
              href="https://www.coingecko.com/"
              className="link link-hover"
              target="_blank"
              rel="noopener noreferrer"
            >
              CoinGecko
            </a>
          </>
        ) : (
          <span aria-hidden>&nbsp;</span>
        )}
      </p>

      <div className="min-h-[3.5rem] text-xs text-base-content/75">
        {props.footnote ?? <span aria-hidden>&nbsp;</span>}
      </div>
    </div>
  );
}

function getPaymentContent(
  coin: PaymentCoinId,
  priceUsd: number,
  loading: boolean,
  quote: (usd: number, coin: CoinId) => string | undefined,
  prices: CoinPrices | null,
): PaymentPanelContentProps {
  switch (coin) {
    case "ethereum":
      return {
        description: (
          <>
            ETH or stablecoins on Ethereum or major L2s. {" "}
            <a
              href={PAYMENT_ADDRESSES.fluidkeyHostedUrl}
              className="link"
              target="_blank"
              rel="noopener noreferrer"
            >
              More details
            </a>
          </>
        ),
        address: PAYMENT_ADDRESSES.fluidkeyEns,
        symbol: "ETH",
        loading,
        amount: quote(priceUsd, "ethereum"),
        spotPrice: prices?.ethereum,
      };
    case "bitcoin":
      return {
        description: "Bitcoin Silent Payments (SP1).",
        address: PAYMENT_ADDRESSES.bitcoinSp1,
        symbol: "BTC",
        loading,
        amount: quote(priceUsd, "bitcoin"),
        spotPrice: prices?.bitcoin,
        footnote: (
          <div className="space-y-1">
            <p className="text-sm">No SP1 wallet? Regular Bitcoin address (no privacy guarantees).</p>
            <p className="font-mono text-xs text-base-content/60 mt-2">
              {PAYMENT_ADDRESSES.bitcoinRegular}
            </p>
          </div>
        ),
      };
    case "zcash":
      return {
        description: "Zcash shielded Orchard payments.",
        address: PAYMENT_ADDRESSES.zcash,
        symbol: "ZEC",
        loading,
        amount: quote(priceUsd, "zcash"),
        spotPrice: prices?.zcash,
      };
    case "monero":
      return {
        description: "Standard Monero (XMR) payments.",
        address: PAYMENT_ADDRESSES.monero,
        symbol: "XMR",
        loading,
        amount: quote(priceUsd, "monero"),
        spotPrice: prices?.monero,
      };
  }
}

function PaymentSelector(props: {
  priceUsd: number;
  loading: boolean;
  quote: (usd: number, coin: CoinId) => string | undefined;
  prices: CoinPrices | null;
}) {
  const [activeCoin, setActiveCoin] = useState<PaymentCoinId>("ethereum");
  const content = getPaymentContent(
    activeCoin,
    props.priceUsd,
    props.loading,
    props.quote,
    props.prices,
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {PAYMENT_COINS.map((coin) => (
          <button
            key={coin.id}
            type="button"
            role="tab"
            aria-selected={activeCoin === coin.id}
            onClick={() => setActiveCoin(coin.id)}
          >
            <span
              className={
                activeCoin === coin.id
                  ? "badge badge-primary cursor-pointer"
                  : "badge badge-outline badge-primary cursor-pointer"
              }
            >
              {coin.label}
            </span>
          </button>
        ))}
      </div>

      <div
        className="mt-3 rounded-lg bg-base-200 p-4"
        role="tabpanel"
      >
        <PaymentPanelContent {...content} />
      </div>
    </div>
  );
}

export function PayWithCryptoPanel(props: PayWithCryptoPanelProps) {
  const supportEmail = props.supportEmail ?? SITE_CONFIG.CONTACT_EMAIL;
  const { loading, quote, prices } = useCoinPrices();
  const { priceUsd, eventLabel } = props.pricing;

  return (
    <div className={props.className}>
      {props.showHeader !== false ? (
        <header className="space-y-1">
          <h2 className="text-xl font-semibold">Pay with crypto</h2>
          <p className="mt-2">
            Send any equivalent of{" "}
            <span className="text-primary font-bold">
              ${priceUsd} USD{eventLabel ? "*" : ""}
            </span>{" "}
            using the rates below or your wallet&apos;s exchange rate.
          </p>
          {eventLabel ? (
            <p className="mt-2 text-xs text-base-content/60">
              *${priceUsd} crypto rate during {eventLabel} only.
            </p>
          ) : null}
        </header>
      ) : null}

      <div className={props.showHeader !== false ? "mt-6" : undefined}>
        <PaymentSelector priceUsd={priceUsd} loading={loading} quote={quote} prices={prices} />

        <a
          href={PAYMENT_ADDRESSES.fluidkeyHostedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block rounded-lg border border-dashed border-accent/40 p-4 transition-colors hover:border-accent/70 hover:bg-accent/5"
        >
          <p className="text-sm font-semibold text-accent">More payment options →</p>
          <p className="mt-1 text-xs text-base-content/75">
            Cross-chain payments from Bitcoin, Solana, Tron, and more via Fluidkey.
          </p>
        </a>

        <div className="mt-6 space-y-2">
          <h3 className="text-sm font-semibold">Paid? Questions?</h3>
          <p className="text-sm text-base-content/80">
            Once confirmed, send your transaction receipt to <strong>wslyvh.42</strong> (Signal),{" "}
            <a
              href="https://t.me/wslyvh"
              className="link"
              target="_blank"
              rel="noopener noreferrer"
            >
              @wslyvh
            </a>{" "}
            (Telegram), or{" "}
            <Link href={`mailto:${supportEmail}`} className="link">
              {supportEmail}
            </Link>{" "}
            and we&apos;ll send your license as soon as possible. Typically within 24 hours.
          </p>
        </div>
      </div>
    </div>
  );
}

export function PayWithCryptoDialog(props: PayWithCryptoDialogProps) {
  if (!props.open) return null;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-h-[85vh] w-full max-w-lg overflow-y-auto p-5 sm:p-6">
        <PayWithCryptoPanel
          pricing={props.pricing}
          supportEmail={props.supportEmail}
          showHeader={props.showHeader}
        />
        <div className="modal-action mt-4">
          <button type="button" className="btn btn-sm" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={props.onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}

export function PayWithCryptoButton(props: PayWithCryptoButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={props.className}
        data-umami-event={props.analyticsEvent}
        onClick={() => setOpen(true)}
      >
        {props.children}
      </button>
      <PayWithCryptoDialog
        open={open}
        onClose={() => setOpen(false)}
        pricing={props.pricing}
        supportEmail={props.supportEmail}
      />
    </>
  );
}
