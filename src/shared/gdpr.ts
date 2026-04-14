export interface LanguageOption {
  label: string;
  flag: string;
}

export interface EmailTemplate {
  deletionSubject: string;
  deletion: string;
  accessSubject: string;
  access: string;
  accountRefLabel: string;
}

export interface CompanyOption {
  slug: string;
  name: string;
  runs?: string[];
  categories?: string[];
  address?: string;
  web?: string;
  email?: string;
  phone?: string;
  quality?: string;
  comments?: string[];
  suggestedTransportMedium?: string;
  webform?: string;
  domains: string[];
}

export type GdprRequestAction = "access" | "delete";

export interface GdprRequestContext {
  language: string;
  action: GdprRequestAction;
  companyName: string;
  companyEmail?: string;
  companyWebform?: string;
  userName: string;
  userEmail: string;
  accountReference?: string;
}

export const LANGUAGES: Record<string, LanguageOption> = {
  en: { label: "English", flag: "🇬🇧" },
  nl: { label: "Dutch", flag: "🇳🇱" },
  de: { label: "German", flag: "🇩🇪" },
  fr: { label: "French", flag: "🇫🇷" },
  es: { label: "Spanish", flag: "🇪🇸" },
  it: { label: "Italian", flag: "🇮🇹" },
  pt: { label: "Portuguese", flag: "🇵🇹" },
};

const TLD_LANG_CODES = new Set(
  Object.keys(LANGUAGES).filter((code) => code !== "en"),
);

export function detectLanguageFromDomain(domain?: string) {
  if (!domain) return "en";
  const tld = domain.split(".").pop()?.toLowerCase() ?? "";
  return TLD_LANG_CODES.has(tld) ? tld : "en";
}

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  en: {
    accountRefLabel: "Account reference",
    deletionSubject: "Personal Data Deletion Request",
    deletion: `To whom it may concern,

I am writing to request the deletion of all personal data you hold about me. I no longer wish for you to process my data and there is no ongoing reason for you to retain it.

Please:
- Delete all personal data and account history associated with me
- Unsubscribe me from all marketing communications
- Stop any further processing of my data
- Notify any third parties you have shared my data with

Account identifier:
- Email: %EMAIL%%ACCOUNT_REF%

Please confirm completion of this request within 30 days.

If you need any information to verify my identity, feel free to reach out. Thank you!

Best regards,
%NAME%`,
    accessSubject: "Personal Data Access Request",
    access: `To whom it may concern,

I am writing to request access to the personal data you hold about me.

Please provide:
- A copy of all personal data you hold about me
- The purposes for which my data is being processed
- The categories of data you hold
- Any third parties my data has been shared with
- How long you intend to retain my data

Account identifier:
- Email: %EMAIL%%ACCOUNT_REF%

Please respond to this request within 30 days.

If you need any information to verify my identity, feel free to reach out. Thank you!

Best regards,
%NAME%`,
  },
  nl: {
    accountRefLabel: "Accountreferentie",
    deletionSubject: "Verzoek tot verwijdering van persoonsgegevens",
    deletion: `Geachte heer/mevrouw,

Hierbij verzoek ik u alle persoonsgegevens die u over mij verwerkt te verwijderen. Ik wens niet langer dat u mijn gegevens verwerkt en er is geen geldige reden meer om deze te bewaren.

Ik verzoek u het volgende te doen:
- Alle persoonsgegevens en accountgeschiedenis te verwijderen
- Mij af te melden voor alle marketingcommunicatie
- Alle verdere verwerking van mijn gegevens te staken
- Eventuele derde partijen waarmee mijn gegevens zijn gedeeld hiervan op de hoogte te stellen

Accountgegevens:
- E-mail: %EMAIL%%ACCOUNT_REF%

Ik verzoek u de voltooiing van dit verzoek binnen 30 dagen te bevestigen.

Met vriendelijke groet,
%NAME%`,
    accessSubject: "Verzoek tot inzage in persoonsgegevens",
    access: `Geachte heer/mevrouw,

Hierbij verzoek ik u inzage te verlenen in de persoonsgegevens die u over mij verwerkt.

Ik verzoek u het volgende te verstrekken:
- Een kopie van alle persoonsgegevens die u over mij beschikt
- De doeleinden waarvoor mijn gegevens worden verwerkt
- De categorieën gegevens die u verwerkt
- Eventuele derde partijen waarmee mijn gegevens zijn gedeeld
- De bewaartermijn van mijn gegevens

Accountgegevens:
- E-mail: %EMAIL%%ACCOUNT_REF%

Ik verzoek u binnen 30 dagen op dit verzoek te reageren.

Met vriendelijke groet,
%NAME%`,
  },
  de: {
    accountRefLabel: "Kontoreferenz",
    deletionSubject: "Antrag auf Löschung personenbezogener Daten",
    deletion: `Sehr geehrte Damen und Herren,

Hiermit beantrage ich die Löschung aller personenbezogenen Daten, die Sie über mich verarbeiten. Ich wünsche nicht länger, dass Sie meine Daten verarbeiten, und es besteht kein berechtigter Grund mehr, diese aufzubewahren.

Ich bitte Sie um folgendes:
- Löschung aller personenbezogenen Daten und Kontodaten
- Abmeldung von allen Marketingmitteilungen
- Einstellung jeglicher weiterer Verarbeitung meiner Daten
- Benachrichtigung etwaiger Dritter, an die meine Daten weitergegeben wurden

Kontodaten:
- E-Mail: %EMAIL%%ACCOUNT_REF%

Ich bitte um eine Bestätigung der Durchführung innerhalb von 30 Tagen.

Mit freundlichen Grüßen,
%NAME%`,
    accessSubject: "Antrag auf Auskunft über personenbezogene Daten",
    access: `Sehr geehrte Damen und Herren,

Hiermit beantrage ich Auskunft über die personenbezogenen Daten, die Sie über mich verarbeiten.

Bitte stellen Sie mir folgendes zur Verfügung:
- Eine Kopie aller personenbezogenen Daten, die Sie über mich gespeichert haben
- Die Zwecke, für die meine Daten verarbeitet werden
- Die Kategorien der verarbeiteten Daten
- Etwaige Dritte, an die meine Daten weitergegeben wurden
- Die geplante Speicherdauer meiner Daten

Kontodaten:
- E-Mail: %EMAIL%%ACCOUNT_REF%

Ich bitte um eine Antwort innerhalb von 30 Tagen.

Mit freundlichen Grüßen,
%NAME%`,
  },
  fr: {
    accountRefLabel: "Référence de compte",
    deletionSubject: "Demande de suppression de données personnelles",
    deletion: `Madame, Monsieur,

Je vous adresse la présente afin de demander la suppression de toutes les données personnelles que vous détenez à mon sujet. Je ne souhaite plus que vous traitiez mes données et il n'existe aucune raison valable de les conserver.

Veuillez procéder comme suit :
- Supprimer toutes les données personnelles et l'historique de compte me concernant
- Me désabonner de toutes les communications marketing
- Cesser tout traitement ultérieur de mes données
- Informer les éventuels tiers avec lesquels mes données ont été partagées

Identifiant de compte :
- E-mail : %EMAIL%%ACCOUNT_REF%

Je vous prie de bien vouloir confirmer l'exécution de cette demande dans un délai de 30 jours.

Cordialement,
%NAME%`,
    accessSubject: "Demande d'accès aux données personnelles",
    access: `Madame, Monsieur,

Je vous adresse la présente afin de demander accès aux données personnelles que vous détenez à mon sujet.

Veuillez me fournir les éléments suivants :
- Une copie de toutes les données personnelles que vous détenez à mon sujet
- Les finalités pour lesquelles mes données sont traitées
- Les catégories de données que vous détenez
- Les éventuels tiers avec lesquels mes données ont été partagées
- La durée de conservation prévue de mes données

Identifiant de compte :
- E-mail : %EMAIL%%ACCOUNT_REF%

Je vous prie de bien vouloir répondre à cette demande dans un délai de 30 jours.

Cordialement,
%NAME%`,
  },
  es: {
    accountRefLabel: "Referencia de cuenta",
    deletionSubject: "Solicitud de eliminación de datos personales",
    deletion: `Estimado/a señor/a,

Por medio de la presente, solicito la eliminación de todos los datos personales que usted tiene sobre mí. Ya no deseo que trate mis datos y no existe ninguna razón válida para conservarlos.

Le ruego que proceda de la siguiente manera:
- Eliminar todos los datos personales e historial de cuenta asociados a mí
- Darme de baja de todas las comunicaciones de marketing
- Cesar cualquier tratamiento posterior de mis datos
- Notificar a los terceros con quienes se hayan compartido mis datos

Identificador de cuenta:
- Correo electrónico: %EMAIL%%ACCOUNT_REF%

Le ruego que confirme la realización de esta solicitud en un plazo de 30 días.

Atentamente,
%NAME%`,
    accessSubject: "Solicitud de acceso a datos personales",
    access: `Estimado/a señor/a,

Por medio de la presente, solicito acceso a los datos personales que usted tiene sobre mí.

Le ruego que me proporcione lo siguiente:
- Una copia de todos los datos personales que tiene sobre mí
- Los fines para los que se tratan mis datos
- Las categorías de datos que tiene sobre mí
- Los terceros con quienes se han compartido mis datos
- El período de conservación previsto de mis datos

Identificador de cuenta:
- Correo electrónico: %EMAIL%%ACCOUNT_REF%

Le ruego que responda a esta solicitud en un plazo de 30 días.

Atentamente,
%NAME%`,
  },
  it: {
    accountRefLabel: "Riferimento account",
    deletionSubject: "Richiesta di cancellazione dei dati personali",
    deletion: `Gentile Signore/Signora,

Con la presente, richiedo la cancellazione di tutti i dati personali che Lei detiene su di me. Non desidero più che i miei dati vengano trattati e non sussiste alcun motivo valido per conservarli.

La prego di procedere come segue:
- Cancellare tutti i dati personali e la cronologia dell'account a me associati
- Annullare la mia iscrizione a tutte le comunicazioni di marketing
- Cessare qualsiasi ulteriore trattamento dei miei dati
- Informare eventuali terze parti con cui i miei dati sono stati condivisi

Dati dell'account:
- E-mail: %EMAIL%%ACCOUNT_REF%

La prego di confermare il completamento di questa richiesta entro 30 giorni.

Cordiali saluti,
%NAME%`,
    accessSubject: "Richiesta di accesso ai dati personali",
    access: `Gentile Signore/Signora,

Con la presente, richiedo l'accesso ai dati personali che Lei detiene su di me.

La prego di fornirmi quanto segue:
- Una copia di tutti i dati personali che detiene su di me
- Le finalità per cui i miei dati vengono trattati
- Le categorie di dati che detiene
- Eventuali terze parti con cui i miei dati sono stati condivisi
- Il periodo di conservazione previsto per i miei dati

Dati dell'account:
- E-mail: %EMAIL%%ACCOUNT_REF%

La prego di rispondere a questa richiesta entro 30 giorni.

Cordiali saluti,
%NAME%`,
  },
  pt: {
    accountRefLabel: "Referência de conta",
    deletionSubject: "Pedido de eliminação de dados pessoais",
    deletion: `Exmo./Exma. Senhor/Senhora,

Por meio da presente, solicito a eliminação de todos os dados pessoais que detém sobre mim. Não desejo que os meus dados continuem a ser tratados e não existe qualquer razão válida para os conservar.

Solicito que proceda da seguinte forma:
- Eliminar todos os dados pessoais e histórico de conta associados a mim
- Cancelar a minha subscrição de todas as comunicações de marketing
- Cessar qualquer tratamento posterior dos meus dados
- Notificar eventuais terceiros com quem os meus dados foram partilhados

Identificador de conta:
- E-mail: %EMAIL%%ACCOUNT_REF%

Solicito que confirme a conclusão deste pedido no prazo de 30 dias.

Com os melhores cumprimentos,
%NAME%`,
    accessSubject: "Pedido de acesso a dados pessoais",
    access: `Exmo./Exma. Senhor/Senhora,

Por meio da presente, solicito acesso aos dados pessoais que detém sobre mim.

Solicito que me forneça o seguinte:
- Uma cópia de todos os dados pessoais que detém sobre mim
- As finalidades para as quais os meus dados são tratados
- As categorias de dados que detém sobre mim
- Eventuais terceiros com quem os meus dados foram partilhados
- O período de retenção previsto para os meus dados

Identificador de conta:
- E-mail: %EMAIL%%ACCOUNT_REF%

Solicito que responda a este pedido no prazo de 30 dias.

Com os melhores cumprimentos,
%NAME%`,
  },
};

export function applyTemplate(
  template: string,
  userEmail: string,
  accountIdentifier?: string,
  accountRefLabel = "Account reference",
  userName?: string,
) {
  return template
    .replace(/%EMAIL%/g, userEmail)
    .replace(
      "%ACCOUNT_REF%",
      accountIdentifier ? `\n- ${accountRefLabel}: ${accountIdentifier}` : "",
    )
    .replace("%NAME%", userName?.trim() || userEmail);
}

export function buildDeletionEmail(
  userEmail: string,
  accountIdentifier?: string,
  lang = "en",
  userName?: string,
) {
  const t = EMAIL_TEMPLATES[lang] ?? EMAIL_TEMPLATES.en;
  return {
    subject: t.deletionSubject,
    body: applyTemplate(
      t.deletion,
      userEmail,
      accountIdentifier,
      t.accountRefLabel,
      userName,
    ),
  };
}

export function buildAccessEmail(
  userEmail: string,
  accountIdentifier?: string,
  lang = "en",
  userName?: string,
) {
  const t = EMAIL_TEMPLATES[lang] ?? EMAIL_TEMPLATES.en;
  return {
    subject: t.accessSubject,
    body: applyTemplate(
      t.access,
      userEmail,
      accountIdentifier,
      t.accountRefLabel,
      userName,
    ),
  };
}

export function buildGdprMessage(context: GdprRequestContext) {
  let subject: string;
  let bodyTemplate: string;

  if (context.action === "delete") {
    const email = buildDeletionEmail(
      context.userEmail,
      context.accountReference,
      context.language,
      context.userName,
    );
    subject = email.subject;
    bodyTemplate = email.body;
  } else {
    const email = buildAccessEmail(
      context.userEmail,
      context.accountReference,
      context.language,
      context.userName,
    );
    subject = email.subject;
    bodyTemplate = email.body;
  }

  return {
    subject,
    body: bodyTemplate,
    to: context.companyEmail || "privacy@company.com",
  };
}
