import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy – MyFinance",
};

export default function PrivacyPage() {
  const lastUpdated = "28 May 2026";

  return (
    <article className="prose-custom">
      <p className="font-label text-[11px] uppercase tracking-widest text-[var(--color-secondary)]">
        Legal
      </p>
      <h1 className="mt-3 text-4xl font-semibold text-[var(--color-primary)]">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-[var(--color-secondary)]">Last updated: {lastUpdated}</p>

      <Section title="1. Overview">
        <p>
          MyFinance is a personal finance application intended for exclusive private use by its
          owner. It is not a commercial product and is not offered to third parties.
        </p>
      </Section>

      <Section title="2. Data Collected">
        <p>MyFinance collects only data that you explicitly provide or authorise:</p>
        <ul>
          <li>
            <strong>Account credentials</strong> — email address used to authenticate via
            Supabase Auth.
          </li>
          <li>
            <strong>Financial data</strong> — account balances, transaction records, and
            categories that you manually enter or import.
          </li>
          <li>
            <strong>Bank connection data</strong> — when you connect a bank account via Enable
            Banking, an OAuth authorisation code and session token are stored to allow
            transaction synchronisation. No bank credentials (username/password) are ever
            stored.
          </li>
        </ul>
      </Section>

      <Section title="3. How Data Is Used">
        <p>All data is used solely to provide the functionality of the application:</p>
        <ul>
          <li>Displaying your accounts, balances, and transactions.</li>
          <li>Importing and categorising transactions from connected bank accounts.</li>
          <li>Generating personal financial summaries and reports.</li>
        </ul>
        <p>
          Data is never sold, shared, or disclosed to any third party except as described in
          Section 4.
        </p>
      </Section>

      <Section title="4. Third-Party Services">
        <p>MyFinance integrates with the following third-party services:</p>
        <ul>
          <li>
            <strong>Supabase</strong> — database and authentication hosting. Data is stored in
            a private Supabase project accessible only to the application owner.
          </li>
          <li>
            <strong>Enable Banking</strong> — open-banking aggregation used to retrieve
            transaction data from connected bank accounts under PSD2. Enable Banking acts as a
            licensed Account Information Service Provider (AISP). Their privacy policy applies
            to any data processed through their service.
          </li>
        </ul>
      </Section>

      <Section title="5. Data Retention">
        <p>
          Data is retained indefinitely for personal record-keeping purposes. You may delete
          any data at any time from within the application or by contacting the application
          owner directly.
        </p>
      </Section>

      <Section title="6. Security">
        <p>
          Data is protected by row-level security policies in Supabase, ensuring that only the
          authenticated owner can access it. Communication between the application and
          third-party APIs is encrypted via HTTPS/TLS.
        </p>
      </Section>

      <Section title="7. Your Rights">
        <p>
          As the sole user of this application, you have full control over all data stored. You
          may request export or deletion of your data at any time by accessing the application
          directly or contacting the owner.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>
          This application is privately operated. For any privacy-related queries, contact the
          application owner directly.
        </p>
      </Section>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-[var(--color-primary)]">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--color-secondary)]">
        {children}
      </div>
    </section>
  );
}
