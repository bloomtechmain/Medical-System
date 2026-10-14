// COMP-02: the sign-up pages said "you agree to Core Health's Terms of Service
// and Privacy Policy" as plain text — no such pages existed, nothing was
// linked, and nothing recorded what anyone had agreed to.
//
// The version string is the part that matters legally: `users.accepted_terms_version`
// stores it at sign-up (migration 008), so there is a record of *which* text a
// given person accepted. Bump it whenever either document changes materially,
// and never edit a published version in place — publish a new one. The date is
// part of the version so it is self-describing in the database.
export const LEGAL_VERSION = '2026-10-14';

// Set to true only once a lawyer has signed off. Until then both pages show a
// visible review banner: COMP-02 explicitly requires legal review because this
// is health data, and shipping unreviewed text that *looks* final is worse
// than shipping text that admits it is a draft.
export const LEGAL_REVIEWED = false;

export const LEGAL_CONTACT = 'privacy@corehealth.lk';
