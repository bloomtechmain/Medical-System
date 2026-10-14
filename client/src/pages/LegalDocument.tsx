import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_VERSION, LEGAL_REVIEWED } from '../legal';

// Shared shell for the Privacy Policy and Terms pages. Public — these have to
// be readable before anyone has an account, which is the whole point.
const LegalDocument = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="min-h-screen bg-gray-50 py-10 px-4">
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="text-sm text-blue-600 hover:underline">&larr; Back</Link>

      <h1 className="mt-4 text-3xl font-bold text-gray-900">{title}</h1>
      <p className="mt-1 text-sm text-gray-500">Version {LEGAL_VERSION}</p>

      {!LEGAL_REVIEWED && (
        // COMP-02 requires a lawyer's review because this is health data.
        // Saying so plainly is more honest than presenting unreviewed text as
        // final, and it stops this being mistaken for a closed item.
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Draft pending legal review.</strong> This document has not yet
          been reviewed by a qualified lawyer. It describes how the system
          actually handles data today and is published so that behaviour is
          transparent, but it is not a final legal agreement. Sri Lanka's
          Personal Data Protection Act and the local rules for medical records
          and prescriptions apply to this service and must be confirmed by a
          lawyer before launch.
        </div>
      )}

      <article className="legal-prose mt-8 space-y-6 text-[15px] leading-relaxed text-gray-700">
        {children}
      </article>

      <div className="mt-10 flex gap-4 border-t border-gray-200 pt-6 text-sm">
        <Link to="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>
        <Link to="/terms" className="text-blue-600 hover:underline">Terms of Service</Link>
      </div>
    </div>
  </div>
);

export const LegalSection = ({ heading, children }: { heading: string; children: ReactNode }) => (
  <section>
    <h2 className="mb-2 text-lg font-semibold text-gray-900">{heading}</h2>
    <div className="space-y-3">{children}</div>
  </section>
);

export default LegalDocument;
