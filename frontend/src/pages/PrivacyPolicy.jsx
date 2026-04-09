/**
 * Privacy Policy page – linked from footer and Settings.
 */
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#FFFDF7] text-[#4A5568]">
      <header className="sticky top-0 z-10 border-b border-[#E2E8F0]/60 bg-[#FFFDF7]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-[#64748B] hover:text-[#FFB4A9] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to REFLECT
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8 pb-16">
        <h1 className="text-2xl font-semibold text-[#2D3748] mb-2">Privacy Policy</h1>
        <p className="text-sm text-[#64748B] mb-8">Last updated: April 2026</p>

        <div className="prose prose-sm max-w-none space-y-6 text-[#4A5568]">
          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">Overview</h2>
            <p className="text-sm leading-relaxed">
              REFLECT is a private reflection companion. Your data is yours. We use it only to provide and personalise the product — we do not sell your data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">Data we store</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
              <li><strong>Account profile</strong> — When you sign in, we store email and display name (from your auth provider or set by you) and preferences (e.g. notification settings) so we can personalise the experience.</li>
              <li>
                <strong>Reflections and history</strong> — Only fragments of your words are stored, not your full text verbatim. We cannot read what you write in full. What is stored is used solely to show your personal history and insights — never reviewed or accessed by us.
              </li>
              <li><strong>Personalisation context</strong> — We keep derived summaries (e.g. recurring themes, recent mood words) to tailor content. We do not store your raw thoughts in this context; it is used only for things like gentle wording in notifications.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">How we use it</h2>
            <p className="text-sm leading-relaxed">
              Profile and preferences are used for personalised notifications (e.g. reminder times, your name in messages) and in-app experience. Reflections and mood data are used only to power your reflection flow, history, and optional insights (e.g. weekly letter, mood over time). We do not use your data for advertising or sell it to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">Your rights</h2>
            <p className="text-sm leading-relaxed">
              You can delete your account and all associated data at any time from Settings → Delete account. This permanently removes your profile, reflections, mood check-ins, and auth account. For other requests (e.g. export, correction), contact us using the details in the app or on the website.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">Security</h2>
            <p className="text-sm leading-relaxed">
              We use industry-standard practices: data in transit over HTTPS, authentication via Supabase, and access to data restricted by your account. Our backend does not log your reflection content.
            </p>
          </section>

          <p className="text-xs text-[#94A3B8] mt-10">
            If you have questions about this policy, please contact us through the app or the support channel provided where you use REFLECT.
          </p>
        </div>
      </main>
    </div>
  );
}
