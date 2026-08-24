"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ActionCard } from "@/components/ActionCard";
import { PayWithCryptoButton } from "@/components/PayWithCrypto";
import { SITE_CONFIG } from "@/utils/config";
import { IRL_CONFIG } from "@/utils/irl";
import { getCryptoPayPricing, getCryptoPrice, LICENSE_PRICING } from "@/utils/pricing";

export function IrlCtaSection() {
  const cryptoPrice = getCryptoPrice();

  return (
    <section id="get-it">
      <ActionCard
        icon={<Sparkles className="h-5 w-5" />}
        title="A tool you own"
        description={
          <>
            Paperweight is a free, open-source desktop app (MIT). But you can support
            open-source software by buying a lifetime license. This unlocks unlimited sync history, multi-account, and all updates.
            One-time purchase, permanent use and no hidden fees. It passes the{" "}
            <Link
              href="https://x.com/VitalikButerin/status/2010621884811845708"
              className="link link-accent"
              target="_blank"
              rel="noopener noreferrer"
            >
              walk-away test
            </Link>
            .
          </>
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap mt-2">
          <PayWithCryptoButton
            pricing={getCryptoPayPricing()}
            className="btn btn-primary plausible-event-name=IRL+Pay+Crypto"
          >
            Pay with crypto (${cryptoPrice})
          </PayWithCryptoButton>
          <a
            href={SITE_CONFIG.LICENSE_URL}
            className="btn btn-ghost plausible-event-name=IRL+Pay+Card"
            target="_blank"
            rel="noopener noreferrer"
          >
            Pay with card (${LICENSE_PRICING.LICENSE_PRICE})
          </a>
        </div>
        <p className="text-sm opacity-60">
          *${cryptoPrice} crypto rate during {IRL_CONFIG.EVENT_LABEL} only.
        </p>
      </ActionCard>
    </section>
  );
}
