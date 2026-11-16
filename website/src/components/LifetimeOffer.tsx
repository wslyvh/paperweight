import { Sparkles } from "lucide-react";
import Link from "next/link";
import { PayWithCryptoButton } from "@/components/PayWithCrypto";
import { checkoutUrl, getCryptoPayPricing, PLANS } from "@/utils/pricing";

interface LifetimeOfferProps {
  checkout?: boolean;
}

export function LifetimeOffer({ checkout = false }: LifetimeOfferProps) {
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body p-6 sm:p-8 gap-4">
        <div className="flex items-start justify-between gap-3">
          <span className="badge badge-primary">Black friday</span>
          <span className="rounded-lg bg-primary/15 p-2 text-primary">
            <Sparkles className="size-5" aria-hidden />
          </span>
        </div>
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold">
              Paperweight Pro Lifetime license
            </h2>
            <p className="text-4xl font-bold">${PLANS.lifetime.price}</p>
            <p className="text-sm opacity-70">
              One-time payment. No subscription. No renewal.
            </p>
            <p className="text-sm opacity-70">Available until Dec 1, 2026</p>
          </div>
          <div className="grid gap-2 md:shrink-0 md:min-w-56">
            {checkout ? (
              <>
                <a
                  href={checkoutUrl("lifetime")}
                  className="btn btn-primary btn-block"
                  data-umami-event="Buy Black Friday Lifetime"
                >
                  Get Lifetime Pro
                </a>
                <PayWithCryptoButton
                  pricing={getCryptoPayPricing("lifetime")}
                  className="btn btn-outline btn-block"
                  analyticsEvent="Pay Crypto Black Friday Lifetime"
                >
                  Pay with crypto (${PLANS.lifetime.cryptoPrice})
                </PayWithCryptoButton>
              </>
            ) : (
              <Link href="/pricing#black-friday" className="btn btn-primary">
                Black Friday offer
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
