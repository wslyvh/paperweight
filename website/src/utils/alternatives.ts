import { PLANS } from "@/utils/pricing";

export interface Alternative {
  slug: string;
  name: string;
  metaDescription: string;
  description: string;
  summary: string;
  rows: {
    dimension: string;
    values: [string, string];
    sourceUrl?: string;
    sourceText?: string;
  }[];
  decision: {
    competitor: string;
    paperweight: string;
  };
}

const discovery =
  "Account evidence, purchases, mailing lists, and company relationships";
const cleanup = "Bulk unsubscribe, move to trash, and report spam after review";
const personalData =
  "Detect personal details in messages and generate access or deletion requests";
const pricing = `Free discovery, a $${PLANS.cleanup.price} Cleanup Pass, or $${PLANS.annual.price} per year`;

export const againstDataAlternative: Alternative = {
  slug: "againstdata-alternative",
  name: "AgainstData",
  metaDescription:
    "Compare Paperweight and AgainstData for account discovery, email cleanup, and deletion requests. Keep email analysis local with an open-source desktop app.",
  description:
    "Find online accounts, clean up unwanted email, and manage your digital footprint. Paperweight is an open-source alternative to AgainstData that keeps your email and analysis on your computer.",
  summary:
    "A hosted web app for inbox cleanup, company discovery, and personal-data deletion requests.",
  decision: {
    competitor:
      "Choose AgainstData if you want a hosted inbox workflow with a dashboard for tracking deletion requests.",
    paperweight:
      "Choose Paperweight if you prefer local account discovery and email cleanup across Gmail, Outlook, Proton Mail through Bridge, or standard IMAP.",
  },
  rows: [
    {
      dimension: "Processing and storage",
      values: ["Locally on your computer", "Hosted service"],
    },
    {
      dimension: "Account discovery",
      values: [discovery, "Company and sender discovery from mailbox metadata"],
    },
    {
      dimension: "Email cleanup",
      values: [cleanup, "Unsubscribe, bulk deletion, and automated cleanup"],
    },
    {
      dimension: "Personal data",
      values: [
        personalData,
        "Send personal-data deletion requests and track responses",
      ],
    },
    {
      dimension: "Email providers",
      values: [
        "Gmail, Outlook, Proton Mail through Bridge, and standard IMAP accounts",
        "Google and Microsoft accounts",
      ],
    },
    {
      dimension: "Pricing",
      values: [pricing, "Limited free trial or $79/year"],
    },
  ],
};

export const cleanEmailAlternative: Alternative = {
  slug: "clean-email-alternative",
  name: "Clean Email",
  metaDescription:
    "Looking for a Clean Email alternative? Discover accounts, unsubscribe in bulk, detect personal data, and send deletion requests locally with Paperweight.",
  description:
    "Go beyond a cleaner inbox. Paperweight helps you discover online accounts, detect personal data, and send deletion requests alongside bulk email cleanup. Your email and analysis stay on your computer.",
  summary:
    "An established email-management app with bulk cleanup, unsubscribe tools, and automated inbox rules.",
  decision: {
    competitor:
      "Choose Clean Email if your priority is ongoing inbox organization with Auto Clean rules and unsubscribe tools.",
    paperweight:
      "Choose Paperweight if you also want to discover accounts and prepare privacy requests while keeping email analysis on your computer.",
  },
  rows: [
    {
      dimension: "Processing and storage",
      values: ["Locally on your computer", "Hosted service"],
    },
    {
      dimension: "Discovery",
      values: [
        discovery,
        "Sender groups and email categories for inbox organization",
      ],
    },
    {
      dimension: "Email cleanup",
      values: [cleanup, "Bulk cleanup, Unsubscriber, and Auto Clean rules"],
    },
    {
      dimension: "Personal data",
      values: [personalData, "Focused on email organization and cleanup"],
    },
    {
      dimension: "Source code",
      values: ["Open source", "Proprietary application"],
    },
    {
      dimension: "Pricing",
      values: [pricing, "Limited free trial or $40/year for 1 account"],
    },
  ],
};

export const leaveMeAloneAlternative: Alternative = {
  slug: "leave-me-alone-alternative",
  name: "Leave Me Alone",
  metaDescription:
    "Compare Paperweight with Leave Me Alone. Go beyond unsubscribe and newsletter Rollups with local account discovery, personal-data detection, and deletion requests.",
  description:
    "Clean up unwanted email and see the accounts behind it. Paperweight combines bulk unsubscribe with account discovery, personal-data detection, and deletion requests in an open-source desktop app.",
  summary:
    "An established unsubscribe service with scheduled Rollups for newsletters you want to keep.",
  decision: {
    competitor:
      "Choose Leave Me Alone if you want newsletters bundled into scheduled Rollups.",
    paperweight:
      "Choose Paperweight if you want account discovery and personal-data requests alongside unsubscribe tools.",
  },
  rows: [
    {
      dimension: "Processing and storage",
      values: ["Locally on your computer", "Hosted service"],
    },
    {
      dimension: "Discovery",
      values: [discovery, "Email subscriptions across connected accounts"],
    },
    {
      dimension: "Email cleanup",
      values: [cleanup, "Unsubscribe tools and inbox screening"],
    },
    {
      dimension: "Newsletter management",
      values: [
        "Review mailing lists and unsubscribe from unwanted senders",
        "Bundle newsletters into scheduled Rollups",
      ],
    },
    {
      dimension: "Personal data",
      values: [personalData, "Focused on subscriptions and inbox management"],
    },
    {
      dimension: "Pricing",
      values: [pricing, "Limited free version or $80/year"],
    },
  ],
};

export const unrollMeAlternative: Alternative = {
  slug: "unroll-me-alternative",
  name: "Unroll.Me",
  metaDescription:
    "An Unroll.Me alternative without selling your email data. Clean up subscriptions, discover accounts, and manage your digital footprint locally with Paperweight.",
  description:
    "Paperweight helps you clean up your inbox and manage email subscriptions without selling your data. Discover forgotten accounts, find personal data, and reduce your digital footprint from your own computer.",
  summary:
    "A long-running subscription-management service with a daily Rollup digest, owned by NielsenIQ.",
  decision: {
    competitor:
      "Choose Unroll.Me if you want a free daily Rollup and are comfortable with its market-research data model.",
    paperweight:
      "Choose Paperweight if you want to manage subscriptions and discover accounts without your email feeding market-research products.",
  },
  rows: [
    {
      dimension: "Processing and storage",
      values: ["Locally on your computer", "Hosted service"],
    },
    {
      dimension: "Data use",
      values: [
        "Email is not sold or used for market research",
        "Email data helps power NielsenIQ market research products",
      ],
    },
    {
      dimension: "Discovery",
      values: [discovery, "Email subscriptions and recurring senders"],
    },
    {
      dimension: "Email cleanup",
      values: [
        cleanup,
        "Manage subscriptions and combine messages into a daily Rollup",
      ],
    },
    {
      dimension: "Personal data",
      values: [personalData, "Focused on email subscriptions"],
    },
    {
      dimension: "Pricing",
      values: [pricing, "Free, but sells user data"],
      sourceText: "sells user data",
      sourceUrl:
        "https://www.theverge.com/2019/12/17/21027159/unroll-me-email-privacy-ftc-settlement",
    },
  ],
};

export const alternatives = [
  againstDataAlternative,
  cleanEmailAlternative,
  leaveMeAloneAlternative,
  unrollMeAlternative,
];
