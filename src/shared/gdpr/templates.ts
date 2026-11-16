import type { EmailTemplate } from "./types";

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
    reminder: `To whom it may concern,

On %DATE% I sent a request regarding my personal data, but I have not yet received a response.

This is a friendly reminder — please let me know the status of my request.

Best regards,
%NAME%`,
    followup: `To whom it may concern,

On %DATE% I sent you a request regarding my personal data. Under data protection law (GDPR), you are required to respond to such requests and more than 30 days have now passed without a response.

Please respond to my request without further delay. If I do not receive a response, I may file a complaint with the data protection authority.

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
    reminder: `Geachte heer/mevrouw,

Op %DATE% heb ik u een verzoek gestuurd met betrekking tot mijn persoonsgegevens, maar ik heb nog geen reactie ontvangen.

Dit is een vriendelijke herinnering — kunt u mij laten weten wat de status van mijn verzoek is?

Met vriendelijke groet,
%NAME%`,
    followup: `Geachte heer/mevrouw,

Op %DATE% heb ik u een verzoek gestuurd met betrekking tot mijn persoonsgegevens. Op grond van de AVG bent u verplicht op een dergelijk verzoek te reageren en er zijn inmiddels meer dan 30 dagen verstreken zonder reactie.

Ik verzoek u zonder verder uitstel op mijn verzoek te reageren. Indien ik geen reactie ontvang, kan ik een klacht indienen bij de Autoriteit Persoonsgegevens.

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
    reminder: `Sehr geehrte Damen und Herren,

am %DATE% habe ich Ihnen eine Anfrage bezüglich meiner personenbezogenen Daten gesendet, jedoch noch keine Antwort erhalten.

Dies ist eine freundliche Erinnerung — bitte teilen Sie mir den Stand meiner Anfrage mit.

Mit freundlichen Grüßen,
%NAME%`,
    followup: `Sehr geehrte Damen und Herren,

am %DATE% habe ich Ihnen eine Anfrage bezüglich meiner personenbezogenen Daten gesendet. Nach der DSGVO sind Sie verpflichtet, auf solche Anfragen zu antworten, und es sind inzwischen mehr als 30 Tage ohne Antwort vergangen.

Bitte beantworten Sie meine Anfrage ohne weitere Verzögerung. Sollte ich keine Antwort erhalten, behalte ich mir vor, Beschwerde bei der Datenschutzbehörde einzulegen.

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
    reminder: `Madame, Monsieur,

Le %DATE%, je vous ai adressé une demande concernant mes données personnelles, mais je n'ai pas encore reçu de réponse.

Ceci est un rappel amical — merci de me tenir informé(e) de l'état d'avancement de ma demande.

Cordialement,
%NAME%`,
    followup: `Madame, Monsieur,

Le %DATE%, je vous ai adressé une demande concernant mes données personnelles. En vertu du RGPD, vous êtes tenu de répondre à une telle demande et plus de 30 jours se sont écoulés sans réponse de votre part.

Je vous prie de répondre à ma demande sans délai supplémentaire. À défaut de réponse, je pourrai déposer une plainte auprès de l'autorité de protection des données.

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
    reminder: `Estimado/a señor/a,

El %DATE% le envié una solicitud relativa a mis datos personales, pero aún no he recibido respuesta.

Este es un recordatorio amistoso — le ruego que me informe del estado de mi solicitud.

Atentamente,
%NAME%`,
    followup: `Estimado/a señor/a,

El %DATE% le envié una solicitud relativa a mis datos personales. Conforme al RGPD, está obligado a responder a dichas solicitudes y han transcurrido más de 30 días sin respuesta.

Le ruego que responda a mi solicitud sin más demora. De no recibir respuesta, podré presentar una reclamación ante la autoridad de protección de datos.

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
    reminder: `Gentile Signore/Signora,

il %DATE% Le ho inviato una richiesta relativa ai miei dati personali, ma non ho ancora ricevuto risposta.

Questo è un cortese promemoria — La prego di informarmi sullo stato della mia richiesta.

Cordiali saluti,
%NAME%`,
    followup: `Gentile Signore/Signora,

il %DATE% Le ho inviato una richiesta relativa ai miei dati personali. Ai sensi del GDPR, Lei è tenuto a rispondere a tali richieste e sono ormai trascorsi più di 30 giorni senza risposta.

La prego di rispondere alla mia richiesta senza ulteriore ritardo. In mancanza di risposta, potrò presentare un reclamo all'autorità per la protezione dei dati.

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
    reminder: `Exmo./Exma. Senhor/Senhora,

No dia %DATE% enviei-lhe um pedido relativo aos meus dados pessoais, mas ainda não recebi resposta.

Este é um lembrete amigável — agradeço que me informe sobre o estado do meu pedido.

Com os melhores cumprimentos,
%NAME%`,
    followup: `Exmo./Exma. Senhor/Senhora,

No dia %DATE% enviei-lhe um pedido relativo aos meus dados pessoais. Nos termos do RGPD, é obrigado a responder a tais pedidos e já passaram mais de 30 dias sem resposta.

Solicito que responda ao meu pedido sem mais demora. Caso não receba resposta, poderei apresentar uma queixa à autoridade de proteção de dados.

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

// Reminder/follow-up subjects are "Re: <original>" so the company's mail
// system threads them onto the original request.
function buildCaseFollowupEmail(
  template: "reminder" | "followup",
  originalSubject: string | undefined,
  requestType: "access" | "deletion",
  sentAt: number,
  userEmail: string,
  lang = "en",
  userName?: string,
) {
  const t = EMAIL_TEMPLATES[lang] ?? EMAIL_TEMPLATES.en;
  const subject =
    originalSubject ?? (requestType === "access" ? t.accessSubject : t.deletionSubject);
  return {
    subject: `Re: ${subject}`,
    body: applyTemplate(t[template], userEmail, undefined, t.accountRefLabel, userName).replace(
      "%DATE%",
      new Date(sentAt).toLocaleDateString(lang),
    ),
  };
}

export function buildReminderEmail(
  originalSubject: string | undefined,
  requestType: "access" | "deletion",
  sentAt: number,
  userEmail: string,
  lang = "en",
  userName?: string,
) {
  return buildCaseFollowupEmail("reminder", originalSubject, requestType, sentAt, userEmail, lang, userName);
}

export function buildFollowupEmail(
  originalSubject: string | undefined,
  requestType: "access" | "deletion",
  sentAt: number,
  userEmail: string,
  lang = "en",
  userName?: string,
) {
  return buildCaseFollowupEmail("followup", originalSubject, requestType, sentAt, userEmail, lang, userName);
}
