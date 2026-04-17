export interface ProviderPreset {
  id: string;
  name: string;
  imap: { host: string; port: number; tls: boolean };
  smtp: { host: string; port: number; tls: boolean };
  allowSelfSigned?: boolean;
  supportUrl?: string;
  appSpecificPasswordUrl?: string;
  notes?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "apple",
    name: "iCloud Mail",
    imap: { host: "imap.mail.me.com", port: 993, tls: true },
    smtp: { host: "smtp.mail.me.com", port: 587, tls: false },
    supportUrl: "https://support.apple.com/en-us/102525",
    appSpecificPasswordUrl: "https://account.apple.com/sign-in",
  },
  {
    id: "proton",
    name: "Proton Mail",
    imap: { host: "127.0.0.1", port: 1143, tls: false },
    smtp: { host: "127.0.0.1", port: 1025, tls: false },
    allowSelfSigned: true,
    supportUrl: "https://proton.me/support/bridge",
    notes: "Proton Bridge must be installed and running. Check your Bridge app as ports might differ.",
  },
  {
    id: "yahoo",
    name: "Yahoo Mail",
    imap: { host: "imap.mail.yahoo.com", port: 993, tls: true },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, tls: true },
    supportUrl: "https://help.yahoo.com/kb/SLN4075.html",
    appSpecificPasswordUrl: "https://login.yahoo.com/account/security",
  },
  {
    id: "fastmail",
    name: "Fastmail",
    imap: { host: "imap.fastmail.com", port: 993, tls: true },
    smtp: { host: "smtp.fastmail.com", port: 465, tls: true },
    supportUrl: "https://www.fastmail.help/hc/en-us/articles/1500000278342",
    appSpecificPasswordUrl: "https://app.fastmail.com/settings/security/devicekeys",
  },
  {
    id: "yandex",
    name: "Yandex Mail",
    imap: { host: "imap.yandex.com", port: 993, tls: true },
    smtp: { host: "smtp.yandex.com", port: 465, tls: true },
    supportUrl: "https://yandex.com/support/mail/mail-clients/others.html",
    appSpecificPasswordUrl: "https://id.yandex.com/security/app-passwords",
  },
  {
    id: "zoho",
    name: "Zoho Mail",
    imap: { host: "imap.zoho.com", port: 993, tls: true },
    smtp: { host: "smtp.zoho.com", port: 465, tls: true },
    supportUrl: "https://www.zoho.com/mail/help/imap-access.html",
    notes: "You may need to enable IMAP access in Zoho Mail settings before connecting. You may also need to create an app-specific password (if 2FA is enabled).",
  },
  {
    id: "mailbox",
    name: "Mailbox.org",
    imap: { host: "imap.mailbox.org", port: 993, tls: true },
    smtp: { host: "smtp.mailbox.org", port: 465, tls: true },
    supportUrl: "https://kb.mailbox.org/en/private/e-mail/e-mail-configuration/",
  },
  {
    id: "posteo",
    name: "Posteo",
    imap: { host: "posteo.de", port: 993, tls: true },
    smtp: { host: "posteo.de", port: 465, tls: true },
    supportUrl: "https://posteo.de/en/help/how-do-i-set-up-posteo-in-an-email-client-pop3-imap-and-smtp",
  },
  {
    id: "gmx",
    name: "GMX",
    imap: { host: "imap.gmx.com", port: 993, tls: true },
    smtp: { host: "mail.gmx.com", port: 587, tls: false },
    supportUrl: "https://support.gmx.com/pop-imap/imap/server.html",
    notes: "You may need to enable IMAP access in GMX web settings before connecting.",
  },
];

export function findPresetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

export function findPresetByHost(host: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.imap.host === host);
}
