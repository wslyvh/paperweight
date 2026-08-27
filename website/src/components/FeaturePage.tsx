import {
  CheckCircle2,
  Github,
  Lock,
  MonitorDown,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { SITE_CONFIG } from "@/utils/config";

export interface WorkflowStep {
  title: string;
  description: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface RelatedFeatureItem {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

interface FeatureHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
}

export function FeatureHero(props: FeatureHeroProps) {
  return (
    <section className="container mx-auto px-4 pt-16 pb-20">
      <div className="max-w-6xl mx-auto grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">{props.title}</h1>
          <p className="text-xl opacity-80 mb-8">{props.description}</p>
          <div className="flex flex-wrap gap-3">
            <a href="/#download" className="btn btn-primary btn-lg">
              Download for free
            </a>
            <a
              href={SITE_CONFIG.LICENSE_URL}
              className="btn btn-soft btn-lg plausible-event-name=Buy+License"
            >
              Buy a license
            </a>
          </div>
          <p className="mt-4 text-sm opacity-70">macOS · Windows · Linux</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-base-300 shadow-2xl ring-1 ring-base-content/5">
          <Image
            src={props.imageSrc}
            alt={props.imageAlt}
            width={props.imageWidth}
            height={props.imageHeight}
            className="w-full h-auto"
            priority
          />
        </div>
      </div>
    </section>
  );
}

interface FeatureWorkflowProps {
  heading: string;
  description?: string;
  steps: WorkflowStep[];
}

export function FeatureWorkflow({
  heading,
  description,
  steps,
}: FeatureWorkflowProps) {
  return (
    <section className="bg-base-200 py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-3xl font-bold mb-3">{heading}</h2>
            {description ? (
              <p className="text-lg opacity-80">{description}</p>
            ) : null}
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <div
                key={step.title}
                className="card bg-base-100 border border-base-300"
              >
                <div className="card-body">
                  <span className="badge badge-primary badge-soft">
                    Step {index + 1}
                  </span>
                  <h3 className="card-title mt-2">{step.title}</h3>
                  <p className="text-sm opacity-80">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

interface RelatedFeaturesProps {
  heading: string;
  description?: string;
  items: RelatedFeatureItem[];
}

export function RelatedFeatures({
  heading,
  description,
  items,
}: RelatedFeaturesProps) {
  return (
    <section className="bg-base-200 py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-3xl font-bold mb-3">{heading}</h2>
            {description ? (
              <p className="text-lg opacity-80">{description}</p>
            ) : null}
          </div>
          <div className="grid gap-6 md:grid-cols-2 max-w-3xl mx-auto">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="card bg-base-100 border border-base-300 hover:bg-base-300 transition-colors"
              >
                <div className="card-body items-center text-center">
                  <div className="mb-4">{item.icon}</div>
                  <h3 className="card-title text-lg mb-2">{item.title}</h3>
                  <p className="text-sm opacity-80">{item.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function FeatureTrustSummary() {
  return (
    <section className="bg-base-300 py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <ShieldCheck
              className="w-10 h-10 text-success mx-auto mb-4"
              strokeWidth={1.5}
            />
            <h2 className="text-3xl font-bold mb-3">
              Built for privacy from the ground up
            </h2>
            <p className="text-lg opacity-80">
              A privacy tool that reads your data in the cloud is not a privacy
              tool. Paperweight connects directly to your provider and stays on
              your computer.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-base-100 border border-base-300 p-5 flex gap-3">
              <Lock className="w-6 h-6 shrink-0 text-success" aria-hidden />
              <div>
                <h3 className="font-semibold">100% local processing</h3>
                <p className="text-sm opacity-80 mt-1">
                  All analysis runs on your device. There are no Paperweight
                  servers and your emails are never shared with anyone.
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-base-100 border border-base-300 p-5 flex gap-3">
              <Github className="w-6 h-6 shrink-0" aria-hidden />
              <div>
                <h3 className="font-semibold">Open source and auditable</h3>
                <p className="text-sm opacity-80 mt-1">
                  Publicly available under the permissive MIT license. Inspect
                  the code, verify our claims, or build it yourself.
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-base-100 border border-base-300 p-5 flex gap-3">
              <CheckCircle2
                className="w-6 h-6 shrink-0 text-info"
                aria-hidden
              />
              <div>
                <h3 className="font-semibold">Review before action</h3>
                <p className="text-sm opacity-80 mt-1">
                  You stay in complete control. Review sender evidence and
                  request templates before anything is sent.
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-base-100 border border-base-300 p-5 flex gap-3">
              <ShieldCheck
                className="w-6 h-6 shrink-0 text-accent"
                aria-hidden
              />
              <div>
                <h3 className="font-semibold">The walk-away test</h3>
                <p className="text-sm opacity-80 mt-1">
                  Zero lock-ins. No servers to maintain, no subscriptions, and a
                  lifetime license that works permanently.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href={SITE_CONFIG.GITHUB_URL}
              className="btn btn-outline btn-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
            <Link href="/privacy" className="btn btn-ghost btn-sm">
              Privacy policy
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

interface FeatureFaqProps {
  items: FaqItem[];
}

export function FeatureFaq({ items }: FeatureFaqProps) {
  return (
    <section className="container mx-auto px-4 py-20">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold mb-8 text-center">
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          {items.map((item) => (
            <details
              key={item.question}
              className="collapse collapse-arrow bg-base-100 border border-base-300"
            >
              <summary className="collapse-title font-semibold">
                {item.question}
              </summary>
              <div className="collapse-content text-sm opacity-80">
                <p>{item.answer}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

interface FeatureCtaAction {
  href: string;
  label: string;
  className: string;
}

interface FeatureFinalCtaProps {
  heading: string;
  body: string;
  primaryAction: FeatureCtaAction;
  secondaryAction: FeatureCtaAction;
}

export function FeatureFinalCta(props: FeatureFinalCtaProps) {
  return (
    <section className="bg-base-200 py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto card bg-base-100 border border-base-300 text-center">
          <div className="card-body items-center py-12">
            <MonitorDown className="w-10 h-10 text-primary" strokeWidth={1.5} />
            <h2 className="text-3xl font-bold mt-2">{props.heading}</h2>
            <p className="text-lg opacity-80 max-w-2xl">{props.body}</p>
            <div className="card-actions mt-4 justify-center">
              <a
                href={props.primaryAction.href}
                className={props.primaryAction.className}
              >
                {props.primaryAction.label}
              </a>
              <a
                href={props.secondaryAction.href}
                className={props.secondaryAction.className}
              >
                {props.secondaryAction.label}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
