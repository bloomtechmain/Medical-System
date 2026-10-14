import LegalDocument, { LegalSection } from './LegalDocument';
import { LEGAL_CONTACT } from '../legal';

// Content is deliberately derived from docs/personal-data-inventory.md (SEC-30)
// rather than written from a template — a privacy policy that does not match
// what the code actually does is worse than none, because it is a false
// statement rather than a missing one. If a data flow changes, update both.
const PrivacyPolicy = () => (
  <LegalDocument title="Privacy Policy">
    <LegalSection heading="Who we are">
      <p>
        Core Health is a medical records and pharmacy platform operating in Sri
        Lanka. It connects patients with doctors, pharmacies and laboratories.
        This policy explains what personal data the service holds, why, who can
        see it, and what you can ask us to do with it.
      </p>
      <p>
        For anything in this policy, contact <strong>{LEGAL_CONTACT}</strong>.
      </p>
    </LegalSection>

    <LegalSection heading="What we collect">
      <p>We hold only what the service needs to work:</p>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          <strong>Account details</strong> — your name, email address, role and
          a cryptographic hash of your password. We never store your password
          itself and cannot recover it, only reset it.
        </li>
        <li>
          <strong>Patient medical profile</strong> (patients only) — date of
          birth, gender, phone, address, emergency contact, blood type,
          allergies, chronic conditions and insurance details.
        </li>
        <li>
          <strong>Clinical records</strong> — consultations, diagnoses,
          treatment notes, prescribed medicines, lab requests and lab results,
          together with any prescription or report file uploaded for them.
        </li>
        <li>
          <strong>Health measurements</strong> — vital signs you enter, or that
          are extracted automatically from a lab report you upload.
        </li>
        <li>
          <strong>Messages</strong> — the conversation thread between you, your
          doctor and your pharmacy about a prescription or lab request.
        </li>
        <li>
          <strong>Professional details</strong> (doctors, pharmacists,
          laboratories) — licence number, qualifications, affiliation and
          contact details, used to establish that you are who you say you are.
        </li>
        <li>
          <strong>Security records</strong> — sign-in attempts, including failed
          ones, and a record of who viewed which patient record. See
          "Our own access" below.
        </li>
      </ul>
      <p>
        We do not use advertising or analytics trackers, and we do not sell or
        share your data with advertisers.
      </p>
    </LegalSection>

    <LegalSection heading="Automatic processing of uploads">
      <p>
        When you upload a prescription or lab report, the service reads text
        from the image or PDF automatically in order to list the medicines or
        record the measurements for you. This happens on our own servers; the
        file is not sent to a third-party service for this purpose. Extracted
        values are a convenience and may be wrong — the uploaded document
        remains the authoritative record, and a clinician should confirm
        anything that matters.
      </p>
    </LegalSection>

    <LegalSection heading="Who can see your data">
      <p>
        Access is restricted by role and by relationship, not just by role:
      </p>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          <strong>You</strong> can always see your own records.
        </li>
        <li>
          <strong>A doctor</strong> can see your clinical history only where
          they are the treating doctor for a consultation, or where you have
          granted them access to a specific category of your records. You can
          decline or revoke such a request.
        </li>
        <li>
          <strong>A pharmacy</strong> sees only the prescription you or your
          doctor sent to that pharmacy — not your wider history.
        </li>
        <li>
          <strong>A laboratory</strong> sees only the test request addressed to
          it and the report it produces.
        </li>
        <li>
          <strong>Each organisation's</strong> operational data (stock, sales,
          orders) is physically separated from every other organisation's in the
          database, so one pharmacy cannot read another's.
        </li>
        <li>
          <strong>Administrators</strong> can see account data and, where
          necessary to operate the service, clinical records. Administrator
          access to a patient record is recorded, including when an
          administrator is acting as another user.
        </li>
      </ul>
    </LegalSection>

    <LegalSection heading="Our own access">
      <p>
        We keep an append-only log of sign-ins and failed sign-ins, changes to
        accounts and permissions, deletions, and each time a patient record is
        opened — including when an administrator is viewing the service as
        another user. The log cannot be altered or erased by the application.
        We keep it so that we can investigate a suspected breach and answer the
        question "who saw my record", which you are entitled to ask.
      </p>
    </LegalSection>

    <LegalSection heading="Where your data is held and how it is protected">
      <p>
        Data is held on managed cloud infrastructure. Connections are encrypted
        in transit, passwords are hashed, uploaded files are stored privately
        and are reachable only through an authenticated request that checks you
        are entitled to the file, and administrator accounts can be required to
        use a second authentication factor.
      </p>
      <p>
        No system is perfectly secure. If a breach affects your personal data,
        we will act on it and notify you and the relevant authority as required
        by law.
      </p>
    </LegalSection>

    <LegalSection heading="How long we keep it">
      <p>
        Medical records are subject to minimum retention periods under local
        rules, which can require us to keep a record even after you ask for it
        to be deleted. Where that applies we restrict access to the record
        instead of erasing it, and erase it when the period ends. Retention
        periods per category of data are documented in our internal retention
        schedule and are being confirmed with legal advice.
      </p>
      <p>
        When a record is deleted in the application it is first marked as
        deleted and hidden, then permanently removed after a short recovery
        window — so an accidental deletion can be undone.
      </p>
    </LegalSection>

    <LegalSection heading="Your rights">
      <p>You can ask us to:</p>
      <ul className="list-disc space-y-1 pl-6">
        <li>give you a copy of the personal data we hold about you;</li>
        <li>correct anything inaccurate;</li>
        <li>delete your data, subject to the retention rules above;</li>
        <li>tell you who has accessed your records;</li>
        <li>withdraw access you previously granted to a clinician.</li>
      </ul>
      <p>
        Email <strong>{LEGAL_CONTACT}</strong>. We will confirm your identity
        before acting, because acting on an unverified request would itself be a
        data breach. Access and consent changes can also be made directly in the
        application.
      </p>
    </LegalSection>

    <LegalSection heading="Children">
      <p>
        A parent or guardian may hold an account on behalf of a child. The
        rights above are exercised by the guardian until the child is old enough
        to do so themselves.
      </p>
    </LegalSection>

    <LegalSection heading="Changes to this policy">
      <p>
        Each version of this policy carries a version identifier, shown at the
        top of this page. We record which version you accepted when you created
        your account. If we change this policy materially we will publish a new
        version and tell you.
      </p>
    </LegalSection>
  </LegalDocument>
);

export default PrivacyPolicy;
