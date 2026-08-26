import { Check, Github, MonitorDown, ShieldCheck } from "lucide-react";
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
          <p className="badge badge-primary badge-soft mb-5">{props.eyebrow}</p>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">{props.title}</h1>
          <p className="text-xl opacity-80 mb-8">{props.description}</p>
          <div className="flex flex-wrap gap-3">
            <a
              href={SITE_CONFIG.LICENSE_URL}
              className="btn btn-primary btn-lg plausible-event-name=Buy+License"
            >
              Buy a license
            </a>
            <a href="/#download" className="btn btn-soft btn-lg">
              Download Paperweight
            </a>
          </div>
          <p className="mt-4 text-sm opacity-70">macOS, Windows, and Linux</p>
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
  steps: WorkflowStep[];
}

export function FeatureWorkflow({ heading, steps }: FeatureWorkflowProps) {
  return (
    <section className="bg-base-200 py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold mb-10 text-center">{heading}</h2>
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
  items: RelatedFeatureItem[];
}

export function RelatedFeatures({ heading, items }: RelatedFeaturesProps) {
  return (
    <section className="bg-base-200 py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold mb-8 text-center">{heading}</h2>
          <div className="grid gap-6 md:grid-cols-2 max-w-3xl mx-auto">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="card bg-base-100 border border-base-300 hover:bg-base-300 transition-colors"
              >
                <div className="card-body">
                  <h3 className="card-title text-lg">{item.title}</h3>
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
  const items = [
    {
      title: "Local-first processing",
      description:
        "Email analysis and your local database stay on your computer. Your emails are never uploaded.",
    },
    {
      title: "Review before actions",
      description:
        "You review company evidence, unsubscribe choices, and deletion requests before anything is sent.",
    },
    {
      title: "Open-source transparency",
      description:
        "The entire codebase is public on GitHub, so you can inspect how your data is handled.",
    },
  ];

  return (
    <section className="bg-base-300 py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <ShieldCheck
              className="w-10 h-10 text-success mx-auto mb-4"
              strokeWidth={1.5}
            />
            <h2 className="text-3xl font-bold mb-3">
              Your email analysis stays on your device
            </h2>
            <p className="text-lg opacity-80">
              Paperweight connects directly to your email provider from your
              computer. No cloud analysis, no telemetry, no data harvesting.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.title}
                className="rounded-lg bg-base-100 p-5 border border-base-300 flex flex-col"
              >
                <div className="flex items-center gap-2 mb-2 font-semibold">
                  <Check className="w-5 h-5 text-success shrink-0" />
                  <span>{item.title}</span>
                </div>
                <p className="text-sm opacity-80 mt-1">{item.description}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/privacy" className="btn btn-soft btn-sm">
              Read privacy details
            </Link>
            <a
              href={SITE_CONFIG.GITHUB_URL}
              className="btn btn-ghost btn-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="w-4 h-4" /> View source on GitHub
            </a>
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
