// Multi-language terms for email processing.
// Covers main European languages: EN, NL, DE, FR, ES, IT, PT.

// Unsubscribe link text patterns — used to match <a> tag inner text in HTML emails.
// Each entry is a case-insensitive regex that matches the link text of an unsubscribe link.
export const UNSUBSCRIBE_LINK_TEXT: RegExp[] = [
  // English
  /\bunsubscribe\b/i,
  /\bopt[\s-]?out\b/i,
  /\bmanage\s*(your\s*)?(email\s*)?(preferences|subscriptions)\b/i,
  /\bupdate\s*(your\s*)?(email\s*)?preferences\b/i,
  /\bno\s*longer\s*wish\s*to\s*receive\b/i,
  /\bstop\s*(receiving|these)\s*(emails|messages)\b/i,

  // Dutch
  /\buitschrijven\b/i,
  /\bafmelden\b/i,
  /\bvoorkeuren\s*beheren\b/i,
  /\bnie(t)?\s*meer\s*ontvangen\b/i,

  // German
  /\babmelden\b/i,
  /\babbestellen\b/i,
  /\baus.*tragen\b/i,
  /\bnicht\s*mehr\s*erhalten\b/i,
  /\babmeldelink\b/i,

  // French
  /\bse\s*d[eé]sabonner\b/i,
  /\bd[eé]sabonnement\b/i,
  /\bne\s*plus\s*recevoir\b/i,
  /\bd[eé]sinscription\b/i,

  // Spanish
  /\bdarse\s*de\s*baja\b/i,
  /\bdesuscribirse\b/i,
  /\bcancelar\s*suscripci[oó]n\b/i,
  /\bdar\s*de\s*baja\b/i,

  // Italian
  /\bdisiscriversi\b/i,
  /\bannullare?\s*(l[a']?\s*)?iscrizione\b/i,
  /\bcancellare?\s*(l[a']?\s*)?iscrizione\b/i,

  // Portuguese
  /\bdesinscrever\b/i,
  /\bcancelar\s*(a\s*)?inscri[cç][aã]o\b/i,
  /\bdescadastrar\b/i,
];

// Message type classification — vendor holds account/personal data.
// Transactional: welcome, verify, password reset, security codes.
// Order: order confirmation, receipt, invoice, shipping, billing.
// Personal (not here): 1:1 human email, colleague — no data at risk.

export const RESET_PASSWORD_PATTERNS: RegExp[] = [
  // English
  /\breset your password\b/i,
  /\bpassword reset\b/i,
  /\bforgot (your )?password\b/i,
  /\bchange your password\b/i,
  // Dutch
  /\bwachtwoord (opnieuw )?instellen\b/i,
  /\bwachtwoord wijzigen\b/i,
  /\bwachtwoord vergeten\b/i,
  // German
  /\bpasswort zur[uü]cksetzen\b/i,
  // French
  /\br[eé]initialiser (le )?mot de passe\b/i,
  // Spanish
  /\brestaurar contraseña\b/i,
  // Italian
  /\bresetta (la )?password\b/i,
  // Portuguese
  /\bredefinir senha\b/i,
];

export const MFA_CODE_PATTERNS: RegExp[] = [
  // English
  /\bverification code\b/i,
  /\blogin code\b/i,
  /\bsecurity code\b/i,
  /\bone-time (password|code)\b/i,
  /\b2fa code\b/i,
  /\bauthentication code\b/i,
  /\bsign[- ]?in code\b/i,
  // Dutch
  /\bverificatiecode\b/i,
  // German
  /\bverifizierungscode\b/i,
  // French
  /\bcode de v[eé]rification\b/i,
  // Spanish
  /\bc[oó]digo de verificaci[oó]n\b/i,
  // Italian
  /\bcodice di verifica\b/i,
  // Portuguese
  /\bc[oó]digo de verifica[cç][aã]o\b/i,
];

export const TRANSACTIONAL_PATTERNS: RegExp[] = [
  // English
  /\bwelcome to\b/i,
  /\bthanks for (signing up|joining|registering)\b/i,
  /\bverify your email\b/i,
  /\bconfirm your (email|account)\b/i,
  /\bactivate your account\b/i,
  /\bget started with\b/i,
  ...RESET_PASSWORD_PATTERNS,
  ...MFA_CODE_PATTERNS,
  // English — appointments, bookings, lessons, support
  /\b(appointment|booking|reservation) (confirmation|confirmed|reminder|cancelled|rescheduled)\b/i,
  /\b(lesson|session|class) (cancellation|cancelled|confirmation|confirmed|scheduled|reminder)\b/i,
  /\bschedule (cancellation|cancellation confirmation)\b/i,
  /\bticket #?\s*\d+\b/i,
  // Dutch
  /\bwelkom (bij|op)\b/i,
  /\bafspraak\b/i,
  /\bcontactverzoek\b/i,
  /\bbevestig (je |uw )?e-?mail\b/i,
  /\bwijzig (je |uw )?wachtwoord\b/i,
  // German
  /\bwillkommen bei\b/i,
  /\be-?mail best[aä]tigen\b/i,
  // French
  /\bbienvenue\b/i,
  /\bconfirmez? votre e-?mail\b/i,
  // Spanish
  /\bbienvenido\b/i,
  /\bconfirma tu e-?mail\b/i,
  // Italian
  /\bbenvenuto\b/i,
  /\bconferma la tua e-?mail\b/i,
  // Portuguese
  /\bbem-vindo\b/i,
  /\bconfirme seu e-?mail\b/i,
  /\bbevestigingscode\b/i,
];

export const ORDER_PATTERNS: RegExp[] = [
  // English
  /\border confirmation\b/i,
  /\byour order\b/i,
  /\breceipt for\b/i,
  /\border #?\d+/i,
  /\bpurchase confirmation\b/i,
  /\bshipping confirmation\b/i,
  /\byour .* has shipped\b/i,
  /\binvoice\b/i,
  /\bbilling (info|statement)\b/i,
  /\bpayment (receipt|confirmation|processed|successful|declined|failed|received)\b/i,
  /\bcharge (receipt|confirmation|processed|successful|declined|failed)\b/i,
  /\byour (monthly |annual |yearly )?(payment|charge|subscription charge|membership charge)\b/i,
  // English — refunds
  /\byour refund\b/i,
  /\brefund (processed|issued|confirmed|approved|received|complete)\b/i,
  // Dutch
  /\bofferte(aanvraag)?\b/i,
  /\bbestelbevestiging\b/i,
  /\b(uw|je) bestelling\b/i,
  /\bontvangstbewijs\b/i,
  /\bverzending\b/i,
  /\bfactuur\b/i,
  /\bretourbon#?\d+/i,
  /\bterugbetaling\b/i,
  /\bbetaling (geautoriseerd|verwerkt|ontvangen|mislukt|geweigerd)\b/i,
  // German
  /\bbestellbest[aä]tigung\b/i,
  /\bihre bestellung\b/i,
  /\bquittung\b/i,
  /\bversand\b/i,
  /\brechnung\b/i,
  /\br[uü]ckerstattung\b/i,
  /\bzahlung (autorisiert|verarbeitet|eingegangen|fehlgeschlagen|abgelehnt)\b/i,
  // French
  /\bconfirmation de commande\b/i,
  /\bvotre commande\b/i,
  /\bre[cç]u\b/i,
  /\bexp[eé]dition\b/i,
  /\bfacture\b/i,
  /\bremboursement\b/i,
  /\bpaiement (autoris[eé]|trait[eé]|re[cç]u|[eé]chou[eé]|refus[eé])\b/i,
  // Spanish
  /\bconfirmaci[oó]n (de )?pedido\b/i,
  /\btu pedido\b/i,
  /\brecibo\b/i,
  /\benv[ií]o\b/i,
  /\bfactura\b/i,
  /\breembolso\b/i,
  /\bpago (autorizado|procesado|recibido|fallido|rechazado)\b/i,
  // Italian
  /\bconferma (dell['']?)?ordine\b/i,
  /\btuo ordine\b/i,
  /\bricevuta\b/i,
  /\bspedizione\b/i,
  /\bfattura\b/i,
  /\brimborso\b/i,
  /\bpagamento (autorizzato|elaborato|ricevuto|fallito|rifiutato)\b/i,
  // Portuguese
  /\bconfirma[cç][aã]o (do )?pedido\b/i,
  /\bseu pedido\b/i,
  /\brecibo\b/i,
  /\benvio\b/i,
  /\bfatura\b/i,
  /\breembolso\b/i,
  /\bpagamento (autorizado|processado|recebido|falhou|recusado)\b/i,
];

// URL path segments that indicate an unsubscribe endpoint.
// Matched against the href URL itself (not link text).
export const UNSUBSCRIBE_URL_PATTERNS: RegExp[] = [
  /unsubscribe/i,
  /optout/i,
  /opt-out/i,
  /uitschrijven/i,
  /afmelden/i,
  /abmelden/i,
  /abbestellen/i,
  /desabonner/i,
  /desinscription/i,
  /desuscribirse/i,
  /darse-de-baja/i,
  /disiscriversi/i,
  /desinscrever/i,
  /descadastrar/i,
];

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
    keywords: {
      en: [
        "bank",
        "banking",
        "credit",
        "loan",
        "investment",
        "insurance",
        "payment",
        "paypal",
        "stripe",
        "wise",
        "revolut",
        "n26",
      ],
      nl: [
        "bank",
        "krediet",
        "verzekering",
        "betaling",
        "rabobank",
        "ing",
        "abn",
      ],
      de: [
        "bank",
        "kredit",
        "versicherung",
        "zahlung",
        "sparkasse",
        "volksbank",
      ],
      fr: ["banque", "crédit", "assurance", "paiement"],
      es: ["banco", "crédito", "seguro", "pago"],
      it: ["banca", "credito", "assicurazione", "pagamento"],
      pt: ["banco", "crédito", "seguro", "pagamento"],
    },
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
    keywords: {
      en: [
        "health",
        "medical",
        "hospital",
        "clinic",
        "doctor",
        "pharmacy",
        "healthcare",
      ],
      nl: [
        "gezondheid",
        "medisch",
        "ziekenhuis",
        "kliniek",
        "dokter",
        "apotheek",
      ],
      de: [
        "gesundheit",
        "medizin",
        "krankenhaus",
        "klinik",
        "arzt",
        "apotheke",
      ],
      fr: ["santé", "médical", "hôpital", "clinique", "médecin", "pharmacie"],
      es: ["salud", "médico", "hospital", "clínica", "doctor", "farmacia"],
      it: ["salute", "medico", "ospedale", "clinica", "dottore", "farmacia"],
      pt: ["saúde", "médico", "hospital", "clínica", "doutor", "farmácia"],
    },
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
    keywords: {
      en: [
        "government",
        "gov",
        "tax",
        "university",
        "school",
        "education",
        "college",
        "academy",
      ],
      nl: [
        "overheid",
        "belasting",
        "universiteit",
        "school",
        "onderwijs",
        "gemeente",
      ],
      de: [
        "regierung",
        "steuer",
        "universität",
        "schule",
        "bildung",
        "behörde",
      ],
      fr: [
        "gouvernement",
        "impôt",
        "université",
        "école",
        "éducation",
        "administration",
      ],
      es: [
        "gobierno",
        "impuesto",
        "universidad",
        "escuela",
        "educación",
        "administración",
      ],
      it: [
        "governo",
        "tasse",
        "università",
        "scuola",
        "istruzione",
        "amministrazione",
      ],
      pt: [
        "governo",
        "imposto",
        "universidade",
        "escola",
        "educação",
        "administração",
      ],
    },
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
    keywords: {
      en: [
        "advertising",
        "marketing",
        "analytics",
        "tracking",
        "data broker",
        "adtech",
      ],
      nl: ["advertentie", "marketing", "analyse", "tracking", "reclame"],
      de: ["werbung", "marketing", "analyse", "tracking", "datenhandel"],
      fr: ["publicité", "marketing", "analyse", "suivi", "courtier"],
      es: ["publicidad", "marketing", "análisis", "seguimiento", "anuncios"],
      it: ["pubblicità", "marketing", "analisi", "tracciamento", "annunci"],
      pt: ["publicidade", "marketing", "análise", "rastreamento", "anúncios"],
    },
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
    keywords: {
      en: [
        "facebook",
        "twitter",
        "instagram",
        "linkedin",
        "tiktok",
        "snapchat",
        "social",
        "messenger",
      ],
      nl: ["sociaal", "netwerk"],
      de: ["sozial", "netzwerk"],
      fr: ["social", "réseau"],
      es: ["social", "red"],
      it: ["sociale", "rete"],
      pt: ["social", "rede"],
    },
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
    keywords: {
      en: [
        "telecom",
        "mobile",
        "phone",
        "vodafone",
        "tmobile",
        "whatsapp",
        "telegram",
        "signal",
        "chat",
      ],
      nl: ["telecom", "mobiel", "telefoon", "kpn", "ziggo", "odido"],
      de: ["telekom", "mobilfunk", "telefon", "telco"],
      fr: ["télécom", "mobile", "téléphone", "orange", "bouygues"],
      es: ["telecom", "móvil", "teléfono", "movistar", "vodafone"],
      it: ["telecom", "mobile", "telefono", "tim", "vodafone"],
      pt: ["telecom", "móvel", "telefone", "meo", "vodafone", "nos"],
    },
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
    keywords: {
      en: [
        "shop",
        "store",
        "amazon",
        "ebay",
        "retail",
        "marketplace",
        "booking",
        "hotel",
        "airline",
        "travel",
      ],
      nl: [
        "winkel",
        "webshop",
        "bol.com",
        "coolblue",
        "boeking",
        "hotel",
        "reis",
      ],
      de: [
        "shop",
        "laden",
        "geschäft",
        "marktplatz",
        "buchung",
        "hotel",
        "reise",
      ],
      fr: ["boutique", "magasin", "commerce", "réservation", "hôtel", "voyage"],
      es: ["tienda", "comercio", "mercado", "reserva", "hotel", "viaje"],
      it: [
        "negozio",
        "commercio",
        "mercato",
        "prenotazione",
        "hotel",
        "viaggio",
      ],
      pt: ["loja", "comércio", "mercado", "reserva", "hotel", "viagem"],
    },
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
    keywords: {
      en: [
        "netflix",
        "spotify",
        "youtube",
        "gaming",
        "game",
        "stream",
        "video",
        "music",
        "podcast",
      ],
      nl: ["streaming", "spel", "video", "muziek", "videoland"],
      de: ["streaming", "spiel", "video", "musik"],
      fr: ["streaming", "jeu", "vidéo", "musique"],
      es: ["streaming", "juego", "vídeo", "música"],
      it: ["streaming", "gioco", "video", "musica"],
      pt: ["streaming", "jogo", "vídeo", "música"],
    },
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
    keywords: {
      en: [
        "utility",
        "electricity",
        "gas",
        "water",
        "internet",
        "provider",
        "energy",
        "power",
        "supplier",
      ],
      nl: [
        "nutsvoorziening",
        "energie",
        "elektriciteit",
        "water",
        "gas",
        "internet",
        "provider",
        "leverancier",
        "vattenfall",
        "essent",
        "eneco",
      ],
      de: [
        "versorgung",
        "strom",
        "energie",
        "wasser",
        "gas",
        "internet",
        "anbieter",
        "versorger",
      ],
      fr: [
        "utilitaire",
        "électricité",
        "énergie",
        "eau",
        "gaz",
        "internet",
        "fournisseur",
      ],
      es: [
        "utilidad",
        "electricidad",
        "energía",
        "agua",
        "gas",
        "internet",
        "proveedor",
      ],
      it: [
        "utilità",
        "elettricità",
        "energia",
        "acqua",
        "gas",
        "internet",
        "fornitore",
      ],
      pt: [
        "utilidade",
        "eletricidade",
        "energia",
        "água",
        "gás",
        "internet",
        "fornecedor",
      ],
    },
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
