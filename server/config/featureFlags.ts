import { logger } from './logger';

// CICD-12: there was no way to turn a risky feature off without a deploy. The
// audit's suggestion is deliberately modest — "start with simple
// environment-variable flags for risky features" — and that is what this is.
// No flag service, no runtime toggling, no per-user targeting: a flag is read
// from the environment at boot and is constant for the life of the process.
//
// The point is that disabling a misbehaving feature becomes a variable change
// and a restart (seconds, reversible) instead of a revert, a build and a
// deploy. For this system the features worth that treatment are the ones that
// can take the whole API down or spend real money.
//
// Flags are a liability if they accumulate: each one doubles the number of
// configurations that nominally work and that nobody tests. Every flag here
// has an owner and a removal condition, and the review in `runbooks/` should
// delete the ones whose condition has been met.

interface FlagDefinition {
  // Value when the environment says nothing. Chosen so that an environment
  // with no flags configured behaves exactly as the code did before flags
  // existed.
  default: boolean;
  description: string;
  // When this flag should be deleted. A flag with no removal condition is
  // permanent configuration, which is a different thing and belongs in
  // docs/environments.md instead.
  removeWhen: string;
}

const DEFINITIONS = {
  // PERF-06 moved OCR into pg-boss, but it still runs in the API process.
  // PRO-15: it is the memory-hungry path, and a burst of large uploads is the
  // realistic way to OOM an instance. Turning this off keeps uploads working
  // and leaves the extraction unprocessed, which is strictly better than the
  // API dying.
  OCR_PROCESSING: {
    default: true,
    description: 'Run OCR/PDF extraction jobs. Off = uploads still accepted, extraction skipped.',
    removeWhen: 'OCR runs in its own worker process with its own memory limit (PRO-15).',
  },

  // PRO-11: public organisation registration creates a database schema and a
  // role per request. Rate-limited now, but it is still the most expensive
  // unauthenticated endpoint in the system and the one to close first under
  // abuse.
  PUBLIC_ORG_REGISTRATION: {
    default: true,
    description: 'Allow unauthenticated organisation self-registration.',
    removeWhen: 'Registration requires email verification before provisioning (PRO-11).',
  },

  // SEC-14/PRO-09. Being able to require MFA for every admin without a deploy
  // is useful during an incident — see runbooks/suspected-data-exposure.md.
  REQUIRE_ADMIN_MFA: {
    default: false,
    description: 'Refuse admin logins that have not enrolled in MFA.',
    removeWhen: 'Every admin account is enrolled and this becomes unconditional.',
  },
} as const satisfies Record<string, FlagDefinition>;

export type FlagName = keyof typeof DEFINITIONS;

// FEATURE_<NAME>=true|false. Anything else is a configuration mistake and is
// reported rather than silently treated as false — a typo'd "ture" quietly
// disabling OCR is precisely the failure this must not have.
const parse = (name: FlagName): boolean => {
  const envName = `FEATURE_${name}`;
  const raw = process.env[envName];
  if (raw === undefined || raw === '') return DEFINITIONS[name].default;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  logger.error(
    { flag: envName, value: raw, using: DEFINITIONS[name].default },
    'Invalid feature flag value — expected "true" or "false". Falling back to the default.'
  );
  return DEFINITIONS[name].default;
};

// Resolved once at boot: a flag that could change mid-process would mean two
// requests in the same deploy behave differently, which is much harder to
// reason about than a restart.
const flags: Record<FlagName, boolean> = Object.fromEntries(
  (Object.keys(DEFINITIONS) as FlagName[]).map(name => [name, parse(name)])
) as Record<FlagName, boolean>;

const isEnabled = (name: FlagName): boolean => flags[name];

// Logged at boot so a log line always answers "which flags were on for this
// deploy" — otherwise a flag-dependent bug is unreproducible after the fact.
const logFlagState = (): void => {
  const nonDefault = (Object.keys(DEFINITIONS) as FlagName[]).filter(
    n => flags[n] !== DEFINITIONS[n].default
  );
  logger.info(
    { flags, overridden: nonDefault },
    nonDefault.length ? 'Feature flags (some overridden)' : 'Feature flags (all default)'
  );
};

export { isEnabled, logFlagState, flags, DEFINITIONS };
