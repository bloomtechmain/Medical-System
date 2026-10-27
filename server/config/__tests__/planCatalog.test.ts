import { FEATURE_CATALOG, PLAN_AUDIENCES, audienceForRole, resolveFeatures, validateFeatures } from '../planCatalog';

describe('plan catalogue', () => {
  it('never puts a patient or an admin on a package', () => {
    expect(audienceForRole('patient')).toBeNull();
    expect(audienceForRole('admin')).toBeNull();
    expect(audienceForRole('doctor')).toBe('doctor');
    expect(audienceForRole('pharmacist')).toBe('pharmacy');
    expect(audienceForRole('laboratory')).toBe('laboratory');
  });

  it('has no duplicate feature keys within an audience', () => {
    for (const audience of PLAN_AUDIENCES) {
      const keys = FEATURE_CATALOG[audience].map(f => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  // A key added to the catalogue after a plan was saved must not quietly
  // switch a paid feature on for everyone on that plan.
  it('fills keys a stored plan does not mention with the off/zero fallback', () => {
    const features = resolveFeatures('doctor', { consultations_per_month: 30 });
    expect(features.consultations_per_month).toBe(30);
    expect(features.lab_requests).toBe(false);
    expect(features.hospital_affiliations).toBe(0);
  });

  it('keeps null as unlimited and ignores keys that are not in the catalogue', () => {
    const features = resolveFeatures('pharmacy', { medicines: null, made_up: true });
    expect(features.medicines).toBeNull();
    expect(features).not.toHaveProperty('made_up');
  });

  it('rejects unknown keys and wrong types instead of dropping them', () => {
    expect(validateFeatures('doctor', { typo_feature: true })).toEqual({ ok: false, error: expect.stringContaining('typo_feature') });
    expect(validateFeatures('doctor', { lab_requests: 'yes' })).toEqual({ ok: false, error: expect.stringContaining('true or false') });
    expect(validateFeatures('doctor', { consultations_per_month: -1 })).toMatchObject({ ok: false });
    expect(validateFeatures('doctor', { consultations_per_month: 2.5 })).toMatchObject({ ok: false });
    expect(validateFeatures('doctor', ['not', 'an', 'object'])).toMatchObject({ ok: false });
  });

  it('accepts a valid feature set and returns every key for the audience', () => {
    const result = validateFeatures('laboratory', { reports_per_month: 100, direct_reports: true, test_catalog: null });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.features).sort()).toEqual(FEATURE_CATALOG.laboratory.map(f => f.key).sort());
      expect(result.features.team_members).toBe(0);
    }
  });
});
