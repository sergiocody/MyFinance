import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service – MyFinance",
};

export default function TermsPage() {
  const lastUpdated = "28 May 2026";

  return (
    <article className="prose-custom">
      <p className="font-label text-[11px] uppercase tracking-widest text-[var(--color-secondary)]">
        Legal
      </p>
      <h1 className="mt-3 text-4xl font-semibold text-[var(--color-primary)]">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-[var(--color-secondary)]">Last updated: {lastUpdated}</p>

      <Section title="1. Nature of the Application">
        <p>
          MyFinance is a personal finance tracking application operated exclusively for private,
          non-commercial use by its owner. It is not made available to the general public.
        </p>
      </Section>

      <Section title="2. Acceptance of Terms">
        <p>
          By accessing or using MyFinance, you confirm that you are the authorised owner of
          this application. Use by any other individual is not permitted.
        </p>
      </Section>

      <Section title="3. Use of the Service">
        <p>You agree to use MyFinance solely for lawful personal finance management, including:</p>
        <ul>
          <li>Tracking personal accounts, income, and expenses.</li>
          <li>Importing and reviewing bank transactions via authorised open-banking connections.</li>
          <li>Categorising and labelling transactions for personal budgeting purposes.</li>
        </ul>
        <p>You agree not to use the application to process data belonging to other individuals.</p>
      </Section>

      <Section title="4. Bank Connections (Enable Banking)">
        <p>
          MyFinance uses Enable Banking, a licensed Account Information Service Provider (AISP)
          under PSD2, to retrieve read-only transaction data from connected bank accounts.
        </p>
        <ul>
          <li>
            Bank connections are authorised through your bank's own OAuth flow. MyFinance
            never stores your banking credentials.
          </li>
          <li>
            Read-only access is granted by you explicitly for each connected account.
          </li>
          <li>
            You may revoke bank access at any time from within the application or directly
            through your bank.
          </li>
        </ul>
      </Section>

      <Section title="5. Disclaimer of Warranties">
        <p>
          MyFinance is provided "as is" for personal use. No warranty is made regarding
          accuracy, availability, or fitness for any particular purpose. Financial data
          displayed is sourced from connected banks and manually entered records — always
          verify important figures directly with your financial institution.
        </p>
      </Section>

      <Section title="6. Limitation of Liability">
        <p>
          The application owner shall not be liable for any financial loss or decision made
          based on data displayed in MyFinance. This application is a personal tool, not a
          regulated financial service.
        </p>
      </Section>

      <Section title="7. Changes to These Terms">
        <p>
          These terms may be updated at any time to reflect changes in the application or
          applicable regulations. The "Last updated" date at the top of this page indicates
          the most recent revision.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>
          For any questions regarding these terms, contact the application owner directly.
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
