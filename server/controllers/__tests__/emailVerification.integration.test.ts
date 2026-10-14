// Integration test against a REAL Postgres database — PRO-11's enforcement is
// a database state check on the login path, and COMP-02's re-acceptance
// writes a column, so neither means anything against a mock.
//
// Requires DATABASE_URL (CI sets it). Skipped without one.
import crypto from 'crypto';
import { pool } from '../../config/db';

const hasDb = !!process.env.DATABASE_URL;
const describeIfDb = hasDb ? describe : describe.skip;

const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

describeIfDb('email verification and terms acceptance (schema behaviour)', () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let userId: number;

  beforeAll(async () => {
    // Registered the way the controller does it: unverified, with an accepted
    // terms version recorded.
    const { rows } = await pool.query(
      `INSERT INTO public.users (name, email, password, role, accepted_terms_version, accepted_terms_at)
       VALUES ('Verify Test', $1, 'x', 'patient', '2026-10-14', NOW())
       RETURNING id`,
      [`verify-${suffix}@test.local`]
    );
    userId = rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM public.users WHERE id = $1', [userId]);
    await pool.end();
  });

  it('starts unverified, so the login check will refuse it', async () => {
    const { rows } = await pool.query(
      'SELECT email_verified_at FROM public.users WHERE id = $1', [userId]
    );
    expect(rows[0].email_verified_at).toBeNull();
  });

  it('stores only the hash of a verification token, never the token', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO public.email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '48 hours')`,
      [userId, sha256(token)]
    );

    // The raw token must not be findable. This is the property that makes a
    // database leak useless rather than a mass account takeover.
    const { rows: raw } = await pool.query(
      'SELECT 1 FROM public.email_verification_tokens WHERE token_hash = $1', [token]
    );
    expect(raw).toHaveLength(0);

    const { rows: hashed } = await pool.query(
      'SELECT 1 FROM public.email_verification_tokens WHERE token_hash = $1', [sha256(token)]
    );
    expect(hashed).toHaveLength(1);
  });

  it('matches only a token that is unused and unexpired', async () => {
    const live = crypto.randomBytes(32).toString('hex');
    const expired = crypto.randomBytes(32).toString('hex');
    const used = crypto.randomBytes(32).toString('hex');

    await pool.query(
      `INSERT INTO public.email_verification_tokens (user_id, token_hash, expires_at, used_at) VALUES
         ($1, $2, NOW() + INTERVAL '1 hour', NULL),
         ($1, $3, NOW() - INTERVAL '1 hour', NULL),
         ($1, $4, NOW() + INTERVAL '1 hour', NOW())`,
      [userId, sha256(live), sha256(expired), sha256(used)]
    );

    // The controller's exact predicate.
    const findable = async (token: string) => {
      const { rows } = await pool.query(
        `SELECT 1 FROM public.email_verification_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
        [sha256(token)]
      );
      return rows.length === 1;
    };

    expect(await findable(live)).toBe(true);
    // An expired link must not work, and — the replay case — neither must one
    // that has already been redeemed, even while still inside its window.
    expect(await findable(expired)).toBe(false);
    expect(await findable(used)).toBe(false);
  });

  it('records verification without overwriting an earlier timestamp', async () => {
    await pool.query(
      'UPDATE public.users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1',
      [userId]
    );
    const { rows: first } = await pool.query(
      'SELECT email_verified_at FROM public.users WHERE id = $1', [userId]
    );
    expect(first[0].email_verified_at).not.toBeNull();

    // Clicking the link twice is normal human behaviour; the COALESCE means
    // the second click does not rewrite when they actually confirmed.
    await pool.query(
      'UPDATE public.users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1',
      [userId]
    );
    const { rows: second } = await pool.query(
      'SELECT email_verified_at FROM public.users WHERE id = $1', [userId]
    );
    expect(second[0].email_verified_at).toEqual(first[0].email_verified_at);
  });

  it('records a terms re-acceptance with a database timestamp', async () => {
    const { rows } = await pool.query(
      `UPDATE public.users
          SET accepted_terms_version = $1, accepted_terms_at = NOW()
        WHERE id = $2 AND deleted_at IS NULL
        RETURNING accepted_terms_version, accepted_terms_at`,
      ['2027-01-01', userId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].accepted_terms_version).toBe('2027-01-01');
    expect(rows[0].accepted_terms_at).toBeInstanceOf(Date);
  });

  it('finds the users who still need to accept, via the partial index predicate', async () => {
    const { rows } = await pool.query(
      `INSERT INTO public.users (name, email, password, role)
       VALUES ('No Terms', $1, 'x', 'patient') RETURNING id`,
      [`noterms-${suffix}@test.local`]
    );
    const pendingId = rows[0].id;

    // COMP-02: this is the query the migration documents for finding everyone
    // who signed up before the documents existed.
    const { rows: pending } = await pool.query(
      'SELECT id FROM public.users WHERE accepted_terms_version IS NULL AND deleted_at IS NULL'
    );
    expect(pending.map(r => r.id)).toContain(pendingId);
    expect(pending.map(r => r.id)).not.toContain(userId);

    await pool.query('DELETE FROM public.users WHERE id = $1', [pendingId]);
  });

  it('removes a user\'s verification tokens with the user', async () => {
    const { rows } = await pool.query(
      `INSERT INTO public.users (name, email, password, role)
       VALUES ('Cascade Test', $1, 'x', 'patient') RETURNING id`,
      [`cascade-${suffix}@test.local`]
    );
    const tempId = rows[0].id;
    await pool.query(
      `INSERT INTO public.email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [tempId, sha256(`cascade-${suffix}`)]
    );

    await pool.query('DELETE FROM public.users WHERE id = $1', [tempId]);

    // A bearer credential must not outlive the account it unlocks.
    const { rows: orphans } = await pool.query(
      'SELECT 1 FROM public.email_verification_tokens WHERE user_id = $1', [tempId]
    );
    expect(orphans).toHaveLength(0);
  });
});
