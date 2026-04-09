/**
 * Refund Policy page – linked from footer and Terms of Service.
 */
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function RefundPolicy() {
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
        <h1 className="text-2xl font-semibold text-[#2D3748] mb-2">Refund Policy</h1>
        <p className="text-sm text-[#64748B] mb-8">Last updated: April 2026</p>

        <div className="prose prose-sm max-w-none space-y-6 text-[#4A5568]">
          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">Free trial</h2>
            <p className="text-sm leading-relaxed">
              REFLECT includes a 7-day free trial. No payment information is required to start. Cancel any time before the trial ends and you will not be charged.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">All sales are final</h2>
            <p className="text-sm leading-relaxed">
              All sales are final after the 7-day free trial ends. Once your paid subscription begins, charges are non-refundable except in the case of billing errors.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">Billing errors</h2>
            <p className="text-sm leading-relaxed">
              If you believe you were charged in error, contact us at{" "}
              <a
                href="mailto:essanirafay@gmail.com"
                className="underline hover:text-[#FFB4A9] transition-colors"
              >
                essanirafay@gmail.com
              </a>{" "}
              and we will review your case within 48 hours.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-medium text-[#2D3748] mt-6 mb-2">Service modifications</h2>
            <p className="text-sm leading-relaxed">
              REFLECT is offered as-is. We reserve the right to modify or discontinue the service at any time. We will make reasonable efforts to notify you in advance of material changes.
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
