import LegalDocument, { LegalSection } from './LegalDocument';
import { LEGAL_CONTACT } from '../legal';

const Terms = () => (
  <LegalDocument title="Terms of Service">
    <LegalSection heading="What this service is">
      <p>
        Core Health is a platform for keeping and sharing medical records
        between patients, doctors, pharmacies and laboratories. It is a
        record-keeping and coordination tool.
      </p>
      <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">
        <strong>It is not a medical service and does not give medical advice.</strong>{' '}
        Nothing in this application diagnoses, prescribes or decides treatment.
        Clinical decisions are made by your clinician. If you believe you have a
        medical emergency, contact emergency services — do not use this
        application to seek urgent help, because nobody is monitoring it for
        emergencies.
      </p>
    </LegalSection>

    <LegalSection heading="Your account">
      <ul className="list-disc space-y-1 pl-6">
        <li>
          Give accurate information. Medical records attached to the wrong
          person are dangerous, not merely untidy.
        </li>
        <li>
          Your account is yours alone. Do not share your password, and do not
          use someone else's account — including a colleague's.
        </li>
        <li>
          Tell us promptly if you think someone else has access to your account:{' '}
          <strong>{LEGAL_CONTACT}</strong>.
        </li>
      </ul>
    </LegalSection>

    <LegalSection heading="Professional accounts">
      <p>
        Doctor, pharmacist and laboratory accounts are verified by an
        administrator before they can be used. By registering as one you confirm
        that you hold a current licence to practise in that role and that the
        licence details you provide are yours. Registering under a professional
        role you do not hold is a misuse of this service and may be a criminal
        offence; we will suspend the account and may report it.
      </p>
      <p>
        If you hold a professional account, you agree to access a patient's
        records only where you have a legitimate clinical reason and the
        patient's relationship or consent allows it. Access to patient records
        is logged.
      </p>
    </LegalSection>

    <LegalSection heading="What you may not do">
      <ul className="list-disc space-y-1 pl-6">
        <li>Access, or try to access, records that are not yours or not within your care.</li>
        <li>Upload another person's medical documents without their consent.</li>
        <li>Upload malware, or content unrelated to the clinical purpose of the record.</li>
        <li>Interfere with the service — automated scraping, probing for weaknesses, or attempting to overload it.</li>
        <li>Copy data out of the service for a purpose the patient has not agreed to.</li>
      </ul>
      <p>
        We may suspend an account that does any of these, immediately and
        without notice where patient data is at risk.
      </p>
    </LegalSection>

    <LegalSection heading="Content you upload">
      <p>
        Your records remain yours. You give us only the permission needed to
        store, process and display them for the purposes described in the
        Privacy Policy — including reading text from an uploaded prescription or
        report automatically so it can be listed for you. We do not use your
        clinical data to train machine-learning models.
      </p>
    </LegalSection>

    <LegalSection heading="Accuracy, and the limits of automatic extraction">
      <p>
        Where the service reads text from an uploaded document automatically,
        the result may be incomplete or wrong. Extracted medicines and
        measurements are a convenience; the uploaded document is the
        authoritative record. Clinicians must confirm anything clinically
        significant against the original rather than relying on the extraction.
      </p>
    </LegalSection>

    <LegalSection heading="Availability">
      <p>
        We aim to keep the service available but do not guarantee uninterrupted
        access. We may take it down for maintenance. Because this service can
        hold records needed for care, do not rely on it as the only copy of a
        document you cannot obtain again.
      </p>
    </LegalSection>

    <LegalSection heading="Liability">
      <p>
        To the extent the law allows, we are not liable for clinical decisions
        made using information in this service, for loss arising from inaccurate
        data entered or uploaded by a user, or for unavailability of the
        service. Nothing here limits liability that cannot be limited by law,
        including liability for death or personal injury caused by negligence.
      </p>
    </LegalSection>

    <LegalSection heading="Ending your use">
      <p>
        You may stop using the service and ask us to delete your account at any
        time, subject to the medical-record retention rules in the Privacy
        Policy. We may end your access if you breach these terms.
      </p>
    </LegalSection>

    <LegalSection heading="Changes and governing law">
      <p>
        Each version of these terms carries a version identifier, shown at the
        top of this page, and we record which version you accepted. Material
        changes will be published as a new version and notified to you.
      </p>
      <p>
        These terms are governed by the laws of Sri Lanka. The specific statutes
        that apply to this service, including those covering medical records and
        prescriptions, are being confirmed with legal advice.
      </p>
    </LegalSection>
  </LegalDocument>
);

export default Terms;
