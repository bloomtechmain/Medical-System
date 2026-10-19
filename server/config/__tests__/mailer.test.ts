// PRO-11: the one configuration that silently locks every new user out is
// "email verification required, no mail path". These cover the boot guard
// that turns it into a refusal to start instead.
//
// The guard runs at module load, so each case loads the module fresh with a
// different environment.

const loadMailer = (env: Record<string, string | undefined>) => {
  jest.resetModules();
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  const exit = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    // Stop execution the way a real exit would, so nothing after the guard
    // runs, but let the test observe the code.
    throw new Error(`process.exit:${code}`);
  }) as never);
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  let exited: number | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../mailer');
  } catch (e) {
    const m = /^process\.exit:(\d+)$/.exec((e as Error).message);
    if (!m) throw e;
    exited = Number(m[1]);
  }

  const result = {
    exited,
    errorOutput: error.mock.calls.map(c => String(c[0])).join('\n'),
    warnOutput: warn.mock.calls.map(c => String(c[0])).join('\n'),
  };

  exit.mockRestore();
  error.mockRestore();
  warn.mockRestore();
  process.env = saved;
  return result;
};

describe('mailer boot guard', () => {
  it('refuses to start in production when verification is required and SMTP is absent', () => {
    const r = loadMailer({
      NODE_ENV: 'production',
      SMTP_HOST: undefined,
      FEATURE_REQUIRE_EMAIL_VERIFICATION: undefined, // defaults to on
    });
    expect(r.exited).toBe(1);
    // The message has to name both halves of the problem and what to do, or
    // whoever hits it at 2am cannot act on it.
    expect(r.errorOutput).toMatch(/NO MAIL PATH/);
    expect(r.errorOutput).toMatch(/SMTP_HOST/);
    expect(r.errorOutput).toMatch(/FEATURE_REQUIRE_EMAIL_VERIFICATION=false/);
    expect(r.errorOutput).toMatch(/mail:test/);
  });

  it('starts in production when SMTP is configured', () => {
    const r = loadMailer({
      NODE_ENV: 'production',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
    });
    expect(r.exited).toBeNull();
    expect(r.errorOutput).not.toMatch(/NO MAIL PATH/);
  });

  it('starts in production when verification is deliberately turned off', () => {
    // An operator accepting unverified addresses knowingly is a valid choice;
    // the guard exists to stop the *accidental* version.
    const r = loadMailer({
      NODE_ENV: 'production',
      SMTP_HOST: undefined,
      FEATURE_REQUIRE_EMAIL_VERIFICATION: 'false',
    });
    expect(r.exited).toBeNull();
    expect(r.errorOutput).not.toMatch(/NO MAIL PATH/);
  });

  it('only warns in development, where the console fallback is the point', () => {
    const r = loadMailer({
      NODE_ENV: 'development',
      SMTP_HOST: undefined,
      FEATURE_REQUIRE_EMAIL_VERIFICATION: undefined,
    });
    expect(r.exited).toBeNull();
    // The warning has to tell a developer how to actually get the link.
    expect(r.warnOutput).toMatch(/verify-email\?token=/);
  });

  it('only warns under test, so the suite never exits on this', () => {
    const r = loadMailer({
      NODE_ENV: 'test',
      SMTP_HOST: undefined,
      FEATURE_REQUIRE_EMAIL_VERIFICATION: undefined,
    });
    expect(r.exited).toBeNull();
  });
});
