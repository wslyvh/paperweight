import { type CompanyOption, detectLanguageFromDomain } from "./gdpr";

export interface Dpa {
  flag: string;
  country: string;
  dpaName: string;
  phone: string;
  email?: string;
  address: string;
  complaintUrl: string;
  websiteUrl: string;
  englishOk?: boolean;
  warning?: string;
  tld?: string;
  languageCode?: string;
  countryAliases?: string[];
}

export interface GdprGeneratorInitialState {
  companyQuery?: string;
  selectedCompany?: CompanyOption;
  manualOrgEmail?: string;
}

export const EU_DPAS: Dpa[] = [
  {
    flag: "🇦🇹",
    country: "Austria",
    dpaName: "Datenschutzbehörde (DSB)",
    phone: "+43 1 52 152-0",
    email: "dsb@dsb.gv.at",
    address: "Barichgasse 40-42, 1030 Vienna",
    complaintUrl: "https://dsb.gv.at/eingabe-an-die-dsb/formulare",
    websiteUrl: "https://data-protection-authority.gv.at",
    englishOk: true,
    tld: "at",
    countryAliases: ["österreich"],
  },
  {
    flag: "🇧🇪",
    country: "Belgium",
    dpaName: "Autorité de protection des données (APD / GBA)",
    phone: "+32 2 274 48 00",
    email: "contact@apd-gba.be",
    address: "Drukpersstraat 35, 1000 Brussels",
    complaintUrl:
      "https://www.autoriteprotectiondonnees.be/introduire-une-requete-une-plainte",
    websiteUrl: "https://www.dataprotectionauthority.be",
    warning:
      "Complaints must be in French, Dutch, or German. English submissions are not accepted.",
    tld: "be",
    countryAliases: ["belgique", "belgië"],
  },
  {
    flag: "🇩🇰",
    country: "Denmark",
    dpaName: "Datatilsynet",
    phone: "+45 33 19 32 00",
    email: "dt@datatilsynet.dk",
    address: "Carl Jacobsens Vej 35, 2500 Valby",
    complaintUrl: "https://www.datatilsynet.dk/english/file-a-complaint",
    websiteUrl: "https://www.datatilsynet.dk/english",
    warning:
      "Online form requires MitID (Danish national eID). Non-residents should file by email or use the PDF form instead.",
    tld: "dk",
    countryAliases: ["danmark"],
  },
  {
    flag: "🇫🇮",
    country: "Finland",
    dpaName:
      "Office of the Data Protection Ombudsman (Tietosuojavaltuutetun toimisto)",
    phone: "+358 29 56 66700",
    email: "tietosuoja@om.fi",
    address: "P.O. Box 800, FI-00531 Helsinki",
    complaintUrl:
      "https://tietosuoja.fi/en/notification-to-the-data-protection-ombudsman",
    websiteUrl: "https://www.tietosuoja.fi/en/",
    warning:
      "Complaints are processed in Finnish or Swedish. English submissions may be accepted but Finnish is strongly preferred.",
    tld: "fi",
  },
  {
    flag: "🇫🇷",
    country: "France",
    dpaName: "Commission Nationale de l'Informatique et des Libertés (CNIL)",
    phone: "+33 1 53 73 22 22",
    address: "3 Place de Fontenoy, 75007 Paris",
    complaintUrl: "https://www.cnil.fr/fr/plaintes",
    websiteUrl: "https://www.cnil.fr/en/",
    warning: "Complaint process is French only. No English submission accepted.",
    tld: "fr",
    languageCode: "fr",
  },
  {
    flag: "🇩🇪",
    country: "Germany",
    dpaName: "BfDI + 16 state DPAs",
    phone: "+49 228 997799-0",
    email: "poststelle@bfdi.bund.de",
    address: "Graurheindorfer Str. 153, 53117 Bonn",
    complaintUrl:
      "https://www.bfdi.bund.de/EN/Buerger/Inhalte/Allgemein/Datenschutz/BeschwerdeBeiDatenschutzbehoerden.html",
    websiteUrl: "https://www.bfdi.bund.de",
    warning:
      "For private companies, file with the state DPA where the company is headquartered, not the federal BfDI. Forms are German only.",
    tld: "de",
    languageCode: "de",
    countryAliases: ["deutschland"],
  },
  {
    flag: "🇮🇪",
    country: "Ireland",
    dpaName: "Data Protection Commission (DPC)",
    phone: "+353 1 765 0100",
    email: "info@dataprotection.ie",
    address: "6 Pembroke Row, Dublin 2, D02 X963",
    complaintUrl:
      "https://www.dataprotection.ie/en/individuals/exercising-your-rights/raising-concern-commission",
    websiteUrl: "https://www.dataprotection.ie/en",
    englishOk: true,
    warning:
      "Ireland is the EU lead supervisory authority for most major US tech companies (Google, Meta, Apple, Microsoft). Complaints cannot be accepted by phone — submit via webform or email only.",
    tld: "ie",
  },
  {
    flag: "🇮🇹",
    country: "Italy",
    dpaName: "Garante per la protezione dei dati personali",
    phone: "+39 06 696771",
    email: "garante@gpdp.it",
    address: "Piazza Venezia 11, 00187 Roma",
    complaintUrl:
      "https://www.garanteprivacy.it/diritti/come-agire-per-tutelare-i-tuoi-dati-personali/reclamo",
    websiteUrl: "https://www.garanteprivacy.it/web/garante-privacy-en",
    warning:
      "Italian only. Download the template and submit by registered mail (raccomandata). PEC email is not available to non-residents.",
    tld: "it",
    languageCode: "it",
    countryAliases: ["italia"],
  },
  {
    flag: "🇳🇱",
    country: "Netherlands",
    dpaName: "Autoriteit Persoonsgegevens (AP)",
    phone: "+31 70 888 8500",
    email: "info@autoriteitpersoonsgegevens.nl",
    address: "Postbus 93374, 2509 AJ Den Haag",
    complaintUrl: "https://klachten.autoriteitpersoonsgegevens.nl/",
    websiteUrl: "https://www.autoriteitpersoonsgegevens.nl/en",
    englishOk: true,
    tld: "nl",
    languageCode: "nl",
    countryAliases: ["nederland", "the netherlands"],
  },
  {
    flag: "🇵🇱",
    country: "Poland",
    dpaName: "Urząd Ochrony Danych Osobowych (UODO)",
    phone: "+48 22 531 03 00",
    email: "kancelaria@uodo.gov.pl",
    address: "ul. Stanisława Moniuszki 1A, 00-014 Warsaw",
    complaintUrl: "https://uodo.gov.pl/en/664/1408",
    websiteUrl: "https://uodo.gov.pl/en",
    warning:
      "Polish only. Formal complaints must be submitted via the electronic inbox (ePUAP) or by post — email is not a formal complaint channel.",
    tld: "pl",
    countryAliases: ["polska"],
  },
  {
    flag: "🇱🇺",
    country: "Luxembourg",
    dpaName: "Commission Nationale pour la Protection des Données (CNPD)",
    phone: "+352 26 10 60 1",
    email: "info@cnpd.lu",
    address: "15, Boulevard du Jazz, L-4370 Belvaux",
    complaintUrl:
      "https://cnpd.public.lu/en/particuliers/faire-valoir/formulaire-plainte.html",
    websiteUrl: "https://cnpd.public.lu/en.html",
    warning:
      "Luxembourg is the EU lead supervisory authority for Amazon, PayPal, Skype, and Spotify. Complaint form is primarily in French — download a PDF copy of your submission before closing the form.",
    tld: "lu",
  },
  {
    flag: "🇵🇹",
    country: "Portugal",
    dpaName: "Comissão Nacional de Proteção de Dados (CNPD)",
    phone: "+351 213 928 400",
    email: "geral@cnpd.pt",
    address: "Av. D. Carlos I, 134, 1.º, 1200-651 Lisboa",
    complaintUrl: "https://www.cnpd.pt/cidadaos/participacoes/",
    websiteUrl: "https://www.cnpd.pt/en/",
    warning:
      "Portuguese only. No telephone assistance, all contact must be in writing.",
    tld: "pt",
    languageCode: "pt",
  },
  {
    flag: "🇪🇸",
    country: "Spain",
    dpaName: "Agencia Española de Protección de Datos (AEPD)",
    phone: "900 293 183 (freephone within Spain)",
    email: "uits@aepd.es",
    address: "C/ Jorge Juan 6, 28001 Madrid",
    complaintUrl:
      "https://sedeaepd.gob.es/sede-electronica-web/vistas/infoSede/tramitesCiudadanoReclamaciones.jsf",
    websiteUrl: "https://www.aepd.es/en",
    warning:
      "Online filing requires a Spanish digital certificate (Cl@ve). Non-residents should file by post in Spanish.",
    tld: "es",
    languageCode: "es",
    countryAliases: ["españa"],
  },
  {
    flag: "🇸🇪",
    country: "Sweden",
    dpaName: "Integritetsskyddsmyndigheten (IMY)",
    phone: "+46 8 657 61 00",
    email: "imy@imy.se",
    address: "Box 8114, 104 20 Stockholm",
    complaintUrl: "https://e-tjanster.imy.se/en/klagomal",
    websiteUrl: "https://www.imy.se/en/",
    englishOk: true,
    warning:
      "All submissions become public documents under Sweden's access principle. Use email or post if you have a protected identity.",
    tld: "se",
    countryAliases: ["sverige"],
  },
];

export const NON_EU_DPAS: Dpa[] = [
  {
    flag: "🇬🇧",
    country: "United Kingdom",
    dpaName: "Information Commissioner's Office (ICO)",
    phone: "+44 303 123 1113",
    email: "icocasework@ico.org.uk",
    address: "Wycliffe House, Water Lane, Wilmslow SK9 5AF",
    complaintUrl:
      "https://ico.org.uk/make-a-complaint/data-protection-complaints/",
    websiteUrl: "https://ico.org.uk",
    englishOk: true,
    warning:
      "Post-Brexit: the UK operates under UK GDPR, not EU GDPR. Substantively similar but legally separate.",
    tld: "uk",
    countryAliases: ["uk", "united kingdom"],
  },
  {
    flag: "🇨🇭",
    country: "Switzerland",
    dpaName: "Federal Data Protection and Information Commissioner (FDPIC)",
    phone: "+41 58 462 43 95 (10:00-11:30 only)",
    address: "Feldeggweg 1, CH-3003 Berne",
    complaintUrl: "https://www.edoeb.admin.ch/en/report-form-data-subjects",
    websiteUrl: "https://www.edoeb.admin.ch/en",
    englishOk: true,
    warning:
      "Switzerland operates under nFADP, not GDPR. The FDPIC cannot impose fines directly, for individual enforcement civil court is the primary route.",
    tld: "ch",
    countryAliases: ["schweiz", "suisse"],
  },
  {
    flag: "🇳🇴",
    country: "Norway",
    dpaName: "Datatilsynet",
    phone: "+47 22 39 69 00",
    email: "postkasse@datatilsynet.no",
    address: "Tollbugata 3, 0152 Oslo",
    complaintUrl:
      "https://www.datatilsynet.no/en/about-us/contact-us/how-to-complain-to-the-norwegian-dpa/",
    websiteUrl: "https://www.datatilsynet.no/en/",
    warning:
      "Norway is EEA, not EU — GDPR applies via the EEA Agreement. Online form requires BankID (Norwegian eID). Non-residents should file by email or post.",
    tld: "no",
    countryAliases: ["norge"],
  },
  {
    flag: "🇮🇸",
    country: "Iceland",
    dpaName: "Persónuvernd (Icelandic Data Protection Authority)",
    phone: "+354 510 9600",
    email: "postur@personuvernd.is",
    address: "Laugarvegur 166, 4th floor, 105 Reykjavík",
    complaintUrl: "https://island.is/en/complaint-to-the-data-protection-authority",
    websiteUrl: "https://island.is/s/personuvernd/en/",
    englishOk: true,
    warning:
      "Iceland is EEA, not EU — GDPR applies via the EEA Agreement. English is widely accepted.",
    tld: "is",
    countryAliases: ["island"],
  },
];

const ALL_DPAS = [...EU_DPAS, ...NON_EU_DPAS];

function countryFromIsoCode(dpaCountryCode: string): string | undefined {
  // Flag emoji encodes ISO 3166-1 alpha-2: regional indicator A = U+1F1E6
  const base = 0x1f1e6 - 65;
  const flag = String.fromCodePoint(
    base + dpaCountryCode.toUpperCase().charCodeAt(0),
    base + dpaCountryCode.toUpperCase().charCodeAt(1),
  );
  return ALL_DPAS.find((d) => d.flag === flag)?.country;
}

/**
 * Finds the relevant DPA for a company.
 * Tries dpaCountryCode (2-letter ISO, e.g. "NL") first, then falls back to
 * extracting the last line of the address and normalising to a country name.
 */
export function findDpaByAddress(
  address: string | null,
  dpaCountryCode?: string | null
): Dpa | null {
  if (dpaCountryCode) {
    const byCodeCountry = countryFromIsoCode(dpaCountryCode);
    const byCode = byCodeCountry
      ? ALL_DPAS.find((d) => d.country === byCodeCountry) ?? null
      : null;
    if (byCode) return byCode;
  }

  if (address) {
    const normalizedAddress =
      address
        .toLowerCase()
        .replace(/[.,;]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const lastLine =
      address
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1)
        ?.toLowerCase() ?? "";
    const normalizedLastLine = lastLine
      .replace(/[.,;]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const byAddress =
      ALL_DPAS.find((dpa) => {
        const aliases = [dpa.country, ...(dpa.countryAliases ?? [])].map((v) =>
          v.toLowerCase().replace(/\s+/g, " ").trim(),
        );
        return aliases.some(
          (alias) =>
            normalizedLastLine === alias ||
            normalizedLastLine.endsWith(` ${alias}`) ||
            normalizedAddress.endsWith(` ${alias}`),
        );
      }) ?? null;
    return byAddress;
  }

  return null;
}

export function findDpaByDomain(domain: string): Dpa | null {
  const tld = domain.toLowerCase().split(".").at(-1);
  if (!tld) return null;
  return ALL_DPAS.find((dpa) => dpa.tld === tld) ?? null;
}

export function findCompanyByName(
  companies: CompanyOption[],
  query?: string,
): CompanyOption | undefined {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) return undefined;
  return companies.find((item) => item.name.trim().toLowerCase() === normalized);
}

export function getPreferredDomain(
  company: CompanyOption | undefined,
  manualOrgEmail: string,
): string | undefined {
  const manual = manualOrgEmail.trim();
  if (manual.includes("@")) {
    const host = manual.split("@")[1]?.toLowerCase();
    if (host) return host;
  }
  const companyEmail = company?.email?.trim();
  if (companyEmail?.includes("@")) {
    const host = companyEmail.split("@")[1]?.toLowerCase();
    if (host) return host;
  }
  if (company?.domains?.length) {
    return company.domains[0];
  }
  return undefined;
}

export function detectPreferredGdprLanguage(
  company: CompanyOption | undefined,
  manualOrgEmail: string,
): string {
  const domain = getPreferredDomain(company, manualOrgEmail);
  const dpaByAddress = company?.address
    ? findDpaByAddress(company.address, null)
    : null;
  const dpaByDomain = domain ? findDpaByDomain(domain) : null;
  const dpa = dpaByAddress ?? dpaByDomain;
  return dpa?.languageCode ?? detectLanguageFromDomain(domain);
}

export function buildGdprGeneratorInitialState(
  companies: CompanyOption[],
  companyParam?: string,
): GdprGeneratorInitialState | undefined {
  const company = findCompanyByName(companies, companyParam);
  if (!company) {
    const companyQuery = companyParam?.trim();
    return companyQuery ? { companyQuery } : undefined;
  }

  return {
    companyQuery: company.name,
    selectedCompany: company,
    manualOrgEmail: company.email ?? "",
  };
}
