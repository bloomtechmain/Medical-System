import fs from 'fs';
import net from 'net';

// PRO-07: "there is no virus scan" on uploads. Patients, doctors and
// laboratories upload arbitrary PDFs and images, and those files are later
// downloaded by other people — so an infected upload is a delivery mechanism
// aimed at clinicians, not just a storage problem. The extension check and
// the magic-byte check in uploadSecurity.ts stop a renamed executable from
// being *served as* a PDF; neither has any opinion on whether a genuine PDF
// contains a malicious payload.
//
// This talks to ClamAV's clamd over TCP using the INSTREAM command, rather
// than depending on a wrapper package that shells out to a binary. INSTREAM
// is a small, stable, well-specified protocol, it needs no local clamscan
// executable in the container, and it works unchanged whether clamd runs as a
// sidecar, another ECS task or a shared host — which is what makes this
// deployable at all.
//
// Inert without CLAMAV_HOST, exactly like Sentry and SMTP: local development
// and CI must not require a virus scanner to run. When it is unset, every
// upload is allowed through and a warning is logged, so "we have no scanning"
// is visible rather than silent.

const HOST = process.env.CLAMAV_HOST;
const PORT = parseInt(process.env.CLAMAV_PORT || '3310', 10);
const TIMEOUT_MS = parseInt(process.env.CLAMAV_TIMEOUT_MS || '30000', 10);
// INSTREAM requires each chunk to be below clamd's StreamMaxLength; 64KB
// chunks are well under any default and keep memory flat.
const CHUNK_SIZE = 64 * 1024;

type ScanResult =
  | { scanned: true; clean: true }
  | { scanned: true; clean: false; signature: string }
  | { scanned: false; reason: string };

const isScanningEnabled = (): boolean => !!HOST;

/**
 * Scans a file on local disk with clamd's INSTREAM.
 *
 * Protocol: send `zINSTREAM\0`, then a sequence of <4-byte big-endian length>
 * <data> chunks, then a zero-length chunk to terminate. clamd replies with
 * `stream: OK\0` or `stream: <SIGNATURE> FOUND\0`.
 */
const scanFile = (filePath: string): Promise<ScanResult> =>
  new Promise<ScanResult>(resolve => {
    if (!HOST) { resolve({ scanned: false, reason: 'CLAMAV_HOST not set' }); return; }

    const socket = new net.Socket();
    let response = '';
    let settled = false;

    const finish = (result: ScanResult): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(TIMEOUT_MS);
    socket.on('timeout', () => finish({ scanned: false, reason: `clamd timed out after ${TIMEOUT_MS}ms` }));
    socket.on('error', err => finish({ scanned: false, reason: `clamd connection failed: ${err.message}` }));
    socket.on('data', chunk => { response += chunk.toString('utf8'); });

    socket.on('close', () => {
      if (settled) return;
      const reply = response.replace(/\0/g, '').trim();
      if (/\bOK$/.test(reply)) { finish({ scanned: true, clean: true }); return; }
      const found = reply.match(/stream:\s*(.+?)\s+FOUND/);
      if (found) { finish({ scanned: true, clean: false, signature: found[1] }); return; }
      // An unparseable reply is NOT treated as clean. "I could not tell" and
      // "it is safe" must never collapse into the same answer.
      finish({ scanned: false, reason: `unexpected clamd reply: ${reply || '(empty)'}` });
    });

    socket.connect(PORT, HOST, () => {
      socket.write('zINSTREAM\0');

      const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });
      stream.on('data', (data: Buffer | string) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const size = Buffer.allocUnsafe(4);
        size.writeUInt32BE(buf.length, 0);
        socket.write(size);
        socket.write(buf);
      });
      stream.on('end', () => {
        // Zero-length chunk terminates the stream; clamd then replies.
        socket.write(Buffer.from([0, 0, 0, 0]));
      });
      stream.on('error', err => finish({ scanned: false, reason: `could not read file: ${err.message}` }));
    });
  });

// How to behave when scanning was requested but could not be completed —
// clamd unreachable, timed out, or an unparseable reply.
//
// Default is to REJECT the upload. The alternative (accept on failure) means
// a clamd outage silently turns scanning off, which is the failure mode where
// an infected file gets through while the dashboard still says "scanning
// enabled". Rejecting is visible and recoverable: the user retries, and the
// error log says why. Set CLAMAV_FAIL_OPEN=true to accept instead, for a
// deployment that would rather take the risk than block clinical uploads.
const failOpen = (): boolean => process.env.CLAMAV_FAIL_OPEN === 'true';

export { scanFile, isScanningEnabled, failOpen };
export type { ScanResult };
