import dayjs from "dayjs";
import { SubpageHeader } from "@/components/SubpageHeader";
import { SITE_CONFIG } from "@/utils/config";

export const PRIVACY_LAST_UPDATED = "2026-03-12";

export default async function PrivacyPage() {
  const lastUpdated = dayjs(PRIVACY_LAST_UPDATED).format("MMM DD, YYYY");

  return (
    <div className="container mx-auto w-full px-4 pt-24 pb-12">
      <SubpageHeader
        label="Resources"
        title="Privacy Policy"
      />
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
            <strong>Read your emails</strong> - to scan for mailing lists, and
            other accounts
          </li>
          <li>
            <strong>Modify emails</strong> - to trash, archive, or mark emails
            as spam when you choose
          </li>
          <li>
            <strong>Google API Services User Data Policy</strong> -
            Paperweight's use and transfer to any other app of information
            received from Google APIs will adhere to the Google API Services
            User Data Policy, including the Limited Use requirements.
          </li>
        </ul>
        <p>
          All processing happens <strong>locally on your device</strong>. We
          never see, store, or transmit your email data.
        </p>

        <h3>What data we collect</h3>
        <p>
          The desktop App does not collect any data. Not even analytics or usage
          data. Everything happens locally on your device.
        </p>
        <ul>
          <li>
            When you connect an email account, Paperweight accesses your emails
            locally via your provider's API. That data is stored in a local
            database on your computer and never transmitted to our servers. You
            can delete it at any time by disconnecting your account in the app
            or uninstalling — both remove all locally stored data. OAuth tokens
            used to authenticate are stored locally and never accessible to us.
          </li>
        </ul>
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
            announcements and updates. You can unsubscribe at any time. Using
            the desktop App does not sign you up for the newsletter.
          </li>
          <li>
            <strong>Website analytics</strong> - we use Plausible to understand
            which pages are visited. This is a privacy-friendly analytics tool
            designed to avoid collecting personal data.
          </li>
        </ul>

        <h3>Data protection</h3>
        <p>
          All communication between the Paperweight app and your email provider
          uses secure HTTPS/TLS encryption. OAuth tokens are encrypted and
          stored locally using your operating system's secure credential store
          (macOS Keychain or Windows Credential Manager). Any cached email
          headers or account metadata are stored locally in the application data
          folder on your device.
        </p>

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

        <h3>Data retention and deletion</h3>
        <p>
          Paperweight retains your Google user data (such as email metadata,
          found accounts, and OAuth tokens) strictly locally on your own device.
          We do not retain any of this data on external servers.
        </p>
        <p>You can delete this local data at any time by:</p>
        <ul>
          <li>
            <strong>Wipe all data</strong> within the Paperweight app.
          </li>
          <li>
            <strong>Uninstalling the application</strong> from your device.
          </li>
          <li>
            <strong>Revoking Paperweight's OAuth access</strong> from your
            Provider&apos;s account settings.
          </li>
        </ul>

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
