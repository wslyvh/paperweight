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
  },
];
