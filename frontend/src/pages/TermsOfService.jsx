/**
 * Terms of Service page – linked from footer and Settings.
 */
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
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
        <h1 className="text-2xl font-semibold text-[#2D3748] mb-2">Terms of Service</h1>
        <p className="text-sm text-[#64748B] mb-8">Last updated: February 2026</p>

        <div className="prose prose-sm max-w-none space-y-6 text-[#4A5568]">
          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">Acceptance</h2>
            <p className="text-sm leading-relaxed">
              By using REFLECT (“the service”), you agree to these terms. If you do not agree, please do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">What REFLECT is</h2>
            <p className="text-sm leading-relaxed">
              REFLECT is a private reflection companion. It helps you sit with your thoughts and notice patterns in a gentle, non-judgmental way. It is not a substitute for professional mental health care, therapy, or medical advice. If you are in crisis, please contact a qualified professional or crisis service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">Your use of the service</h2>
            <p className="text-sm leading-relaxed">
              You are responsible for your use of the service and for keeping your account credentials secure. You may not use the service for any illegal purpose or to harm others. We may suspend or terminate access if we reasonably believe you have violated these terms or applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">Privacy and data</h2>
            <p className="text-sm leading-relaxed">
              Your use of REFLECT is also governed by our Privacy Policy. By using the service, you consent to the collection and use of data as described there. You can delete your account and data at any time from Settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">Changes</h2>
            <p className="text-sm leading-relaxed">
              We may update these terms from time to time. We will indicate the “Last updated” date at the top. Continued use of the service after changes constitutes acceptance of the updated terms. For material changes, we may notify you in the app or by email where appropriate.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">Contact</h2>
            <p className="text-sm leading-relaxed">
              For questions about these terms, please contact us through the app or the support channel provided where you use REFLECT.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">Refunds</h2>
            <p className="text-sm leading-relaxed">
              If you are not satisfied with your purchase, you may request a full
              refund within 14 days of your original payment date, no questions
              asked. To request a refund, email{" "}
              <a href="mailto:support@reflectapp.com">support@reflectapp.com</a>{" "}
              with the subject line "Refund Request" and include the email address
              associated with your account. Refunds are processed within 5–10
              business days depending on your payment provider.
            </p>
            <p className="text-sm leading-relaxed">
              After 14 days, refunds are issued at our discretion. If you believe
              you were charged in error, contact us and we will resolve it promptly.
            </p>
            <p className="text-sm leading-relaxed">
              Cancelling your subscription stops future charges but does not
              automatically issue a refund for the current billing period.
              To cancel, go to Settings → Manage Subscription in the app.
            </p>
          </section>

          <p className="text-xs text-[#94A3B8] mt-10">
            Thank you for using REFLECT with care.
          </p>
        </div>
      </main>
    </div>
  );
}
