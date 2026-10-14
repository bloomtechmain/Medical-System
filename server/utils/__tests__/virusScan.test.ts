import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

// PRO-07: the clamd INSTREAM client is hand-written, so the protocol framing
// is tested against a stub clamd rather than trusted. A wrong length prefix
// or a missing terminator would make every scan fail — or, much worse, make
// an unparseable reply look like a pass.
//
// The stub speaks the real protocol: read `zINSTREAM\0`, then
// <4-byte big-endian length><data> chunks until a zero-length chunk, then
// reply. It also asserts the framing it received, so a malformed client is
// caught here rather than showing up as "scanning mysteriously broken".

interface Stub {
  port: number;
  close: () => Promise<void>;
  received: () => Buffer;
  framingOk: () => boolean;
}

const startStubClamd = (reply: string | null): Promise<Stub> =>
  new Promise(resolve => {
    let payload = Buffer.alloc(0);
    let framingOk = false;

    const server = net.createServer(socket => {
      let buf = Buffer.alloc(0);
      let sawCommand = false;

      socket.on('data', (chunk: Buffer | string) => {
        buf = Buffer.concat([buf, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);

        if (!sawCommand) {
          const nul = buf.indexOf(0);
          if (nul === -1) return;
          const command = buf.subarray(0, nul).toString();
          if (command !== 'zINSTREAM') { socket.end('ERROR\0'); return; }
          sawCommand = true;
          buf = buf.subarray(nul + 1);
        }

        // Walk the length-prefixed frames.
        for (;;) {
          if (buf.length < 4) return;
          const len = buf.readUInt32BE(0);
          if (len === 0) {
            // Terminator reached — the client framed everything correctly.
            framingOk = true;
            if (reply === null) { socket.destroy(); return; }
            socket.end(reply);
            return;
          }
          if (buf.length < 4 + len) return;
          payload = Buffer.concat([payload, buf.subarray(4, 4 + len)]);
          buf = buf.subarray(4 + len);
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({
        port,
        close: () => new Promise<void>(r => server.close(() => r())),
        received: () => payload,
        framingOk: () => framingOk,
      });
    });
  });

// scanFile reads CLAMAV_HOST/PORT at module load, so each case needs a fresh
// module with the stub's port in the environment.
const loadScanner = (env: Record<string, string | undefined>) => {
  jest.resetModules();
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../virusScan') as typeof import('../virusScan');
  process.env = saved;
  return mod;
};

describe('clamd INSTREAM client', () => {
  let tempFile: string;
  const CONTENT = 'a'.repeat(200_000); // larger than one 64KB chunk, so framing is exercised

  beforeAll(() => {
    tempFile = path.join(os.tmpdir(), `virusscan-test-${Date.now()}.bin`);
    fs.writeFileSync(tempFile, CONTENT);
  });

  afterAll(() => {
    try { fs.unlinkSync(tempFile); } catch { /* already gone */ }
  });

  it('is inert, and reports why, when CLAMAV_HOST is unset', async () => {
    const { scanFile, isScanningEnabled } = loadScanner({ CLAMAV_HOST: undefined });
    expect(isScanningEnabled()).toBe(false);
    const result = await scanFile(tempFile);
    expect(result).toEqual({ scanned: false, reason: 'CLAMAV_HOST not set' });
  });

  it('streams the whole file in correctly framed chunks and accepts an OK reply', async () => {
    const stub = await startStubClamd('stream: OK\0');
    const { scanFile } = loadScanner({ CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(stub.port) });

    const result = await scanFile(tempFile);

    expect(result).toEqual({ scanned: true, clean: true });
    // The bytes clamd saw must be exactly the file — not truncated at the
    // first chunk, not doubled, not missing the tail.
    expect(stub.received().length).toBe(CONTENT.length);
    expect(stub.received().toString()).toBe(CONTENT);
    expect(stub.framingOk()).toBe(true);
    await stub.close();
  });

  it('reports the signature when clamd finds something', async () => {
    const stub = await startStubClamd('stream: Eicar-Signature FOUND\0');
    const { scanFile } = loadScanner({ CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(stub.port) });

    const result = await scanFile(tempFile);

    expect(result).toEqual({ scanned: true, clean: false, signature: 'Eicar-Signature' });
    await stub.close();
  });

  // The important negative case. "I could not tell" must never be reported as
  // "it is clean" — that is the one bug here that would let malware through
  // while the logs still look healthy.
  it('treats an unparseable reply as NOT scanned rather than clean', async () => {
    const stub = await startStubClamd('something unexpected\0');
    const { scanFile } = loadScanner({ CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(stub.port) });

    const result = await scanFile(tempFile);

    expect(result.scanned).toBe(false);
    expect(result).not.toHaveProperty('clean', true);
    await stub.close();
  });

  it('treats a dropped connection as NOT scanned', async () => {
    const stub = await startStubClamd(null); // destroys the socket without replying
    const { scanFile } = loadScanner({ CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(stub.port) });

    const result = await scanFile(tempFile);

    expect(result.scanned).toBe(false);
    await stub.close();
  });

  it('treats an unreachable clamd as NOT scanned', async () => {
    // Port 1 is reserved and nothing listens on it.
    const { scanFile } = loadScanner({ CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: '1' });
    const result = await scanFile(tempFile);
    expect(result.scanned).toBe(false);
    if (!result.scanned) expect(result.reason).toMatch(/connection failed|timed out/i);
  });

  it('treats an unreadable file as NOT scanned', async () => {
    const stub = await startStubClamd('stream: OK\0');
    const { scanFile } = loadScanner({ CLAMAV_HOST: '127.0.0.1', CLAMAV_PORT: String(stub.port) });

    const result = await scanFile(path.join(os.tmpdir(), 'definitely-does-not-exist-12345.bin'));

    expect(result.scanned).toBe(false);
    await stub.close();
  });

  // Unlike CLAMAV_HOST/PORT, which are read once at module load, failOpen()
  // reads the environment on every call — so these cases set it around the
  // call rather than around the import.
  describe('fail-open policy', () => {
    const { failOpen } = loadScanner({});
    const original = process.env.CLAMAV_FAIL_OPEN;
    afterEach(() => {
      if (original === undefined) delete process.env.CLAMAV_FAIL_OPEN;
      else process.env.CLAMAV_FAIL_OPEN = original;
    });

    const withValue = (value: string | undefined): boolean => {
      if (value === undefined) delete process.env.CLAMAV_FAIL_OPEN;
      else process.env.CLAMAV_FAIL_OPEN = value;
      return failOpen();
    };

    // The default matters: a clamd outage must reject uploads rather than
    // silently becoming "no scanning" while everything reports healthy.
    it('defaults to closed — a failed scan rejects the upload', () => {
      expect(withValue(undefined)).toBe(false);
    });

    it('opens only on an exact "true"', () => {
      expect(withValue('true')).toBe(true);
      expect(withValue('TRUE')).toBe(false);
      expect(withValue('1')).toBe(false);
      expect(withValue('yes')).toBe(false);
    });
  });
});
