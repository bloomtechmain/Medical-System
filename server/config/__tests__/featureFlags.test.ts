// Flags are resolved once at module load from process.env, so each case has
// to set the environment and then load the module fresh — jest.resetModules()
// plus a dynamic require, rather than a top-level import.

const loadFlags = (env: Record<string, string | undefined>) => {
  jest.resetModules();
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../featureFlags') as typeof import('../featureFlags');
  process.env = saved;
  return mod;
};

describe('feature flags', () => {
  it('uses the documented default when the variable is unset', () => {
    const { isEnabled } = loadFlags({ FEATURE_OCR_PROCESSING: undefined, FEATURE_REQUIRE_ADMIN_MFA: undefined });
    // An environment with nothing configured must behave exactly as the code
    // did before flags existed.
    expect(isEnabled('OCR_PROCESSING')).toBe(true);
    expect(isEnabled('PUBLIC_ORG_REGISTRATION')).toBe(true);
    expect(isEnabled('REQUIRE_ADMIN_MFA')).toBe(false);
  });

  it('honours an explicit true/false', () => {
    const off = loadFlags({ FEATURE_OCR_PROCESSING: 'false' });
    expect(off.isEnabled('OCR_PROCESSING')).toBe(false);

    const on = loadFlags({ FEATURE_REQUIRE_ADMIN_MFA: 'true' });
    expect(on.isEnabled('REQUIRE_ADMIN_MFA')).toBe(true);
  });

  // The failure that matters: a typo must not silently disable a feature.
  // "ture", "1", "yes", "TRUE" all fall back to the default rather than being
  // guessed at, and the mistake is logged.
  it.each(['ture', '1', 'yes', 'TRUE', 'off'])('falls back to the default for the invalid value %p', value => {
    const { isEnabled } = loadFlags({ FEATURE_OCR_PROCESSING: value });
    expect(isEnabled('OCR_PROCESSING')).toBe(true);
  });

  it('treats an empty string as unset, not as false', () => {
    const { isEnabled } = loadFlags({ FEATURE_OCR_PROCESSING: '' });
    expect(isEnabled('OCR_PROCESSING')).toBe(true);
  });

  // Flags accumulate into untested configurations, so each one has to carry
  // the information needed to delete it later.
  it('documents every flag with a description and a removal condition', () => {
    const { DEFINITIONS } = loadFlags({});
    for (const [name, def] of Object.entries(DEFINITIONS)) {
      expect(def.description.length).toBeGreaterThan(10);
      expect(def.removeWhen.length).toBeGreaterThan(10);
      expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });
});
