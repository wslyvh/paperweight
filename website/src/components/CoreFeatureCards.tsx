import { FileText, Mail, MapIcon } from "lucide-react";
import Link from "next/link";

export function CoreFeatureCards() {
  return (
    <div className="grid md:grid-cols-3 gap-6">
      <Link
        href="/account-discovery"
        className="card bg-base-100 border border-base-300 shadow-sm hover:bg-base-300 transition-colors"
      >
        <div className="card-body items-center text-center">
          <MapIcon className="w-12 h-12 text-info mb-4" strokeWidth={1.5} />
          <h3 className="card-title text-lg mb-2">Find old accounts</h3>
          <p className="text-sm opacity-80">
            Reconstruct forgotten services and company relationships from
            sign-up messages, receipts, password resets, and security alerts.
          </p>
        </div>
      </Link>

      <Link
        href="/email-cleanup"
        className="card bg-base-100 border border-base-300 shadow-sm hover:bg-base-300 transition-colors"
      >
        <div className="card-body items-center text-center">
          <Mail className="w-12 h-12 text-error mb-4" strokeWidth={1.5} />
          <h3 className="card-title text-lg mb-2">Bulk unsubscribe</h3>
          <p className="text-sm opacity-80">
            Compare active mailing lists, identify the senders creating the most
            noise, and unsubscribe at the source.
          </p>
        </div>
      </Link>

      <Link
        href="/remove-personal-data"
        className="card bg-base-100 border border-base-300 shadow-sm hover:bg-base-300 transition-colors"
      >
        <div className="card-body items-center text-center">
          <FileText className="w-12 h-12 text-primary mb-4" strokeWidth={1.5} />
          <h3 className="card-title text-lg mb-2">Remove personal data</h3>
          <p className="text-sm opacity-80">
            Find phone numbers, addresses, payment details, and identifiers in
            past messages, then prepare deletion requests.
          </p>
        </div>
      </Link>
    </div>
  );
}
