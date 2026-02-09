import { SITE_CONFIG } from "@/utils/config";

export default async function TermsPage() {
  const lastUpdated = "Feb 9, 2026";

  return (
    <div className="container max-w-7xl mx-auto w-full px-4 pt-24 pb-12">
      <h1 className="text-3xl font-semibold mb-6">Terms of Service</h1>
      <p className="text-sm mt-2">Last updated: {lastUpdated}</p>
      <div className="divider"></div>

      <div className="prose max-w-none">
        <h3>1. What Paperweight does</h3>
        <p>
          Paperweight is desktop software that scans your email inbox{" "}
          <strong>locally on your computer</strong> to help you find accounts,
          identify marketing emails, unsubscribe from bulk senders, and clean up
          your inbox.
        </p>

        <h3>2. Use of the app</h3>
        <ul>
          <li>
            You must own or have permission to access the email account you
            connect
          </li>
          <li>
            You're responsible for your cleanup actions - we can't undo deleted
            emails
          </li>
          <li>Don't use Paperweight for anything illegal</li>
        </ul>

        <h3>3. Your data</h3>
        <p>
          All email data you scan remains <strong>your property</strong>. It's
          processed locally on your device. Paperweight is open source so you
          can verify this.
        </p>

        <h3>4. Payment and licenses</h3>
        <ul>
          <li>Prices are shown in EUR including applicable taxes</li>
          <li>
            <strong>Lifetime licenses</strong> grant you access to all updates
            forever
          </li>
          <li>
            Payments are processed by Polar.sh - we don't store payment
            information
          </li>
          <li>
            Refunds are handled case-by-case within 30 days of purchase - email
            us at {SITE_CONFIG.CONTACT_EMAIL}
          </li>
        </ul>

        <h3>5. Software updates</h3>
        <p>
          We can add features, fix bugs, and improve Paperweight at any time.
          The app is open source, so you can always see what changed.
        </p>

        <h3>6. No warranties</h3>
        <p>
          Paperweight is provided <strong>"as is"</strong>. We do our best to
          make it work well, but we can't guarantee it's perfect or will work in
          every situation. Use at your own risk.
        </p>

        <h3>7. Liability</h3>
        <p>
          We're not liable for any data loss, deleted emails, or other damages
          from using Paperweight. Our total liability is limited to the amount
          you paid for your license.
        </p>

        <h3>8. Changes to these terms</h3>
        <p>
          We may update these terms occasionally. The current version is always
          available on our website. Continued use means you accept any changes.
        </p>

        <h3>9. Contact</h3>
        <p>
          <strong>Developer:</strong> {SITE_CONFIG.OWNER_NAME}
          <br />
          <strong>Email:</strong> {SITE_CONFIG.CONTACT_EMAIL}
        </p>
      </div>
    </div>
  );
}
