import { Sparkles } from "lucide-react";
import Link from "next/link";
import { PayWithCryptoButton } from "@/components/PayWithCrypto";
import { checkoutUrl, getCryptoPayPricing, PLANS } from "@/utils/pricing";

interface LifetimeOfferProps {
  checkout?: boolean;
}

export function LifetimeOffer({ checkout = false }: LifetimeOfferProps) {
  return (
    <div className="card relative border border-base-300 bg-base-100">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        aria-hidden
      >
        <Sparkles
          className="absolute -right-12 -top-12 size-80 rotate-12 text-primary/10"
          strokeWidth={1}
        />
      </div>
      <div className="card-body relative p-6 sm:p-8 gap-4">
        <span className="badge badge-outline badge-primary">Black friday</span>
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold">
              Paperweight Pro lifetime license
            </h2>
            <p className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-4xl font-bold">
                ${PLANS.lifetime.price}
              </span>
              <span className="text-sm sm:text-base">/ one-time payment.</span>
            </p>
            <p className="text-sm opacity-70">
              No subscription. No renewal. Available until Dec 1.
            </p>
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
