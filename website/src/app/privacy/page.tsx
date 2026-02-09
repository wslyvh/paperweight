import { SITE_CONFIG } from "@/utils/config";

export default async function PrivacyPage() {
  const lastUpdated = "Feb 9, 2026";

  return (
    <div className="container max-w-7xl mx-auto w-full px-4 pt-24 pb-12">
      <h1 className="text-3xl font-semibold mb-6">Privacy Policy</h1>
      <p className="text-sm mt-2">Last updated: {lastUpdated}</p>
      <div className="divider"></div>
      <div className="prose max-w-none">
        <p className="opacity-80">
          This policy covers both the <strong>Paperweight desktop app</strong>{" "}
          and this <strong>website</strong>.
        </p>
        <p>
          Paperweight is a <strong>local-first desktop application</strong>.
          Your email data stays on your computer and is never uploaded to our
          servers.
        </p>

        <h3>What data we access</h3>
        <p>
          When you connect your email account, Paperweight requests permission
          to:
        </p>
        <ul>
          <li>
            <strong>Read your emails</strong> - to scan for accounts and
            marketing senders
          </li>
          <li>
            <strong>Modify emails</strong> (optional) - to trash, archive, or
            mark emails as read when you choose
          </li>
        </ul>
        <p>
          All processing happens <strong>locally on your device</strong>. We
          never see, store, or transmit your email data.
        </p>

        <h3>What data we collect</h3>
        <p>
          We don't have user accounts for the app and we don't collect your
          email contents.
        </p>
        <p>
          This website may collect limited data when you choose to provide it:
        </p>
        <ul>
          <li>
            <strong>License validation</strong> - when you purchase a license,
            our payment provider (Polar.sh) verifies it's valid. This doesn't
            include any email data.
          </li>
          <li>
            <strong>Newsletter signup</strong> - if you enter your email to get
            updates, we store that email for the purpose of sending product
            announcements and updates. You can unsubscribe at any time.
          </li>
          <li>
            <strong>Website analytics</strong> - we use Plausible to understand
            which pages are visited. This is a privacy-friendly analytics tool
            designed to avoid collecting personal data.
          </li>
        </ul>

        <h3>Open source</h3>
        <p>
          Paperweight is open source. You can verify exactly how it works by
          reviewing the code at <a href={SITE_CONFIG.GITHUB_URL}>GitHub</a>.
        </p>

        <h3>Third parties</h3>
        <ul>
          <li>
            <strong>Email providers</strong> (Gmail, Outlook, etc.) -
            Paperweight connects directly using their official APIs. Your data
            is governed by their privacy policies.
          </li>
          <li>
            <strong>Payment processing</strong> - handled by Polar.sh. We never
            see your payment details.
          </li>
          <li>
            <strong>Newsletter email delivery</strong> - handled by Resend. We
            store your email address for newsletter delivery only.
          </li>
          <li>
            <strong>Website analytics</strong> - handled by Plausible.
          </li>
        </ul>

        <h3>Your rights</h3>
        <p>
          Since we don't collect or store your data, there's nothing for us to
          delete or provide access to. Your email data stays with your email
          provider. You can disconnect Paperweight at any time by revoking OAuth
          permissions in your email provider's settings.
        </p>

        <h3>Contact</h3>
        <p>
          <strong>Developer:</strong> {SITE_CONFIG.OWNER_NAME}
          <br />
          <strong>Email:</strong> {SITE_CONFIG.CONTACT_EMAIL}
        </p>
      </div>
    </div>
  );
}
