// Paperweight's vendor category metadata and product risk presentation.
// Message-level vocabulary belongs to @paperweight/analysis.

export const RISK_CATEGORIES = {
  financial: {
    risk: "high",
    label: "Financial",
    icon: "💳",
    dataAtRisk: [
      "Payment methods and cards",
      "Transaction history",
      "Account balances",
      "Tax information",
      "Credit history",
    ],
    sourceCategories: [
      "financial",
      "finance",
      "insurance",
      "credit agency",
      "collection agency",
    ],
  },

  healthcare: {
    risk: "high",
    label: "Healthcare",
    icon: "🏥",
    dataAtRisk: [
      "Medical records",
      "Health insurance information",
      "Prescriptions and medications",
      "Appointment history",
      "Billing information",
    ],
    sourceCategories: ["healthcare", "health"],
  },

  government: {
    risk: "high",
    label: "Government & Education",
    icon: "🏛️",
    dataAtRisk: [
      "Government ID numbers",
      "Tax information",
      "Educational records",
      "Certificates and credentials",
      "Personal identification",
    ],
    sourceCategories: ["government", "public body", "school"],
  },

  marketing: {
    risk: "medium",
    label: "Marketing & Data Brokers",
    icon: "📊",
    dataAtRisk: [
      "Browsing behavior",
      "Purchase interests",
      "Demographic data",
      "Location tracking",
      "Ad profiles",
    ],
    sourceCategories: ["ads", "addresses"],
  },

  social: {
    risk: "medium",
    label: "Social Media",
    icon: "💬",
    dataAtRisk: [
      "Messages and posts",
      "Photos and videos",
      "Connections and friends",
      "Location history",
      "Personal profile information",
    ],
    sourceCategories: ["social media"],
  },

  communication: {
    risk: "medium",
    label: "Communication",
    icon: "📱",
    dataAtRisk: [
      "Call and message history",
      "Contact lists",
      "Location data",
      "Usage patterns",
    ],
    sourceCategories: ["telecommunication"],
  },

  shopping: {
    risk: "medium",
    label: "Shopping & Travel",
    icon: "🛒",
    dataAtRisk: [
      "Purchase history",
      "Shipping addresses",
      "Payment methods",
      "Browsing history",
      "Travel bookings and passport info",
    ],
    sourceCategories: ["commerce", "travel"],
  },

  entertainment: {
    risk: "low",
    label: "Entertainment",
    icon: "🎮",
    dataAtRisk: [
      "Viewing and listening history",
      "Preferences and recommendations",
      "Gaming profiles",
      "Subscriptions",
    ],
    sourceCategories: ["entertainment"],
  },

  services: {
    risk: "medium",
    label: "Services & Utilities",
    icon: "⚡",
    dataAtRisk: [
      "Account information",
      "Usage data",
      "Billing information",
      "Home address",
    ],
    sourceCategories: ["utility", "church", "nonprofit", "political party"],
  },
};

export const RISK_LEVELS = {
  high: {
    color: "error",
    badge: "🔴",
    label: "High risk",
    description: "May contain sensitive financial, health, or identity data",
  },
  medium: {
    color: "warning",
    badge: "🟡",
    label: "Medium risk",
    description: "May contain personal or commercial data",
  },
  low: {
    color: "success",
    badge: "🟢",
    label: "Low risk",
    description: "Likely only contains limited personal data",
  },
};
