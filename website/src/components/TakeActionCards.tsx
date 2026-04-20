import Link from "next/link";
import { Download, Shield } from "lucide-react";

interface TakeActionCardsProps {
  title?: string;
}

export function TakeActionCards({ title = "Take Action" }: TakeActionCardsProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Link
          href="/resources/gdpr-generator"
          className="card border border-primary/30 bg-base-300 shadow-lg transition-colors hover:border-primary/55"
        >
          <div className="card-body gap-4 p-5">
            <p className="font-semibold text-lg leading-tight flex items-center gap-3">
              <span className="shrink-0 rounded-lg bg-primary/20 text-primary p-2">
                <Shield className="h-5 w-5" />
              </span>
              Generate a GDPR request
            </p>
            <p className="text-sm sm:text-base opacity-90">
              Build a ready-to-send access or deletion request.
            </p>
          </div>
        </Link>
        <Link
          href="/#download"
          className="card border border-info/30 bg-base-300 shadow-lg transition-colors hover:border-info/55"
        >
          <div className="card-body gap-4 p-5">
            <p className="font-semibold text-lg leading-tight flex items-center gap-3">
              <span className="shrink-0 rounded-lg bg-info/20 text-info p-2">
                <Download className="h-5 w-5" />
              </span>
              Download Paperweight
            </p>
            <p className="text-sm sm:text-base opacity-90">
              Scan your inbox to find other accounts linked to exposed data.
            </p>
          </div>
        </Link>
      </div>
    </section>
  );
}
