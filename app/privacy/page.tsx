import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/omni/primitives';

export const metadata = {
  title: 'Privacy — OmniScope',
  description: 'What OmniScope stores, where it is processed, what is shared with AI, and how to export or delete your data.',
};

const rows: Array<[string, string, string]> = [
  ['Account', 'Email, name, sign-in identity', 'To sign you in and keep your data separate from everyone else’s'],
  ['Financial profile', 'Income, expenses, emergency fund, insurance, risk preferences you enter', 'Financial Health score, goal maths, tax slab'],
  ['Portfolio', 'Accounts, holdings, purchase dates, ledger transactions', 'Valuation, X-Ray, Risk Lab, Tax Centre, rebalancer, alerts'],
  ['Goals', 'Goal names, targets, deadlines, SIPs', 'Projections and Monte Carlo probabilities'],
  ['Copilot', 'Your questions, the answers, and the tool results each answer used', 'Your conversation history and the “Show working” trace'],
  ['Cached AI insights', 'News explanations and similar outputs, with an expiry', 'Fewer AI calls and faster pages'],
];

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Privacy notice"
        title="Your money data stays yours."
        question="What OmniScope stores, where it is processed, what the AI sees, and how to take it with you or erase it. Written to the standard of India’s Digital Personal Data Protection Act, 2023."
      />

      <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">What is stored, and why</h2>
          <Card className="mt-3 overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">What</th>
                  <th className="px-4 py-2 font-medium">Used for</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([a, b, c]) => (
                  <tr key={a} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-foreground">{a}</td>
                    <td className="px-4 py-2.5">{b}</td>
                    <td className="px-4 py-2.5">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-3">
            OmniScope collects only what you type in or upload. It never asks for bank or broker passwords, cannot place trades and cannot move money. Market
            prices, fund NAVs and news are public data and contain nothing about you.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Where it is processed</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>The database (Supabase Postgres) is hosted in the AWS Mumbai region (ap-south-1), and the app’s server functions run in Vercel’s Mumbai region.</li>
            <li>Row-level security is switched on for every table, and the server reads only the signed-in user’s rows.</li>
            <li>Connections are encrypted (HTTPS/TLS), including the app’s connection to the database.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">What the AI sees</h2>
          <p className="mt-2">
            The Copilot, the statement reader and the news explainer use Google’s Gemini API. When you ask the Copilot something, Gemini receives your question,
            your name, and the results of the calculations it asks for (for example your holdings list or tax estimate). The news explainer sends the names and
            portfolio weights of your largest holdings with the day’s headlines. Gemini never receives your email, password or other users’ data. A statement
            you upload is sent to Gemini to be read and is not stored as a file.
          </p>
          <p className="mt-2">
            On the free tier of the Gemini API, Google’s terms allow it to use prompts and responses to improve its services. Avoid typing information into the
            Copilot that it does not need, such as account numbers or PAN.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Cookies and analytics</h2>
          <p className="mt-2">
            Only the sign-in session cookies that the app needs to work. Page-view analytics (Vercel Web Analytics) is cookieless and aggregated. Your language
            choice and dismissed alerts are kept in your own browser’s storage.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Your rights</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <span className="font-medium text-foreground">Access and portability:</span> download everything stored about you as one JSON file from your{' '}
              <Link href="/profile" className="text-primary hover:underline">Profile</Link>.
            </li>
            <li>
              <span className="font-medium text-foreground">Correction:</span> edit your profile, holdings, ledger and goals at any time.
            </li>
            <li>
              <span className="font-medium text-foreground">Erasure:</span> delete your account from your Profile. Everything is removed at once, in a single
              database operation, and cannot be recovered.
            </li>
            <li>
              <span className="font-medium text-foreground">Withdrawing consent:</span> stop using the service and delete your account; nothing is kept
              afterwards.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">Retention</h2>
          <p className="mt-2">
            Your data is kept while your account exists and deleted with it. Cached AI insights expire on their own. There are no backups kept by OmniScope
            beyond the database provider’s own short-term recovery window.
          </p>
        </section>

        <p className="border-t border-border pt-6 text-xs">
          OmniScope is a final-year academic project and an educational tool, not a SEBI-registered investment adviser. Questions about this notice can be raised
          with the project maintainer through the project’s repository.
        </p>
      </div>
    </div>
  );
}
