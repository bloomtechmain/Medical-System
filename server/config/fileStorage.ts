import fs from 'fs';
import path from 'path';
import { Response } from 'express';

// ARCH-06: uploaded files (prescriptions, lab reports, referrals, patient
// reports) were written straight to local disk, which Railway (and any
// container host) wipes on every restart or redeploy — already a live
// data-loss risk, not just a multi-instance one.
//
// Set AWS_S3_BUCKET (+ AWS_REGION, and standard AWS credential env vars) to
// switch storage to S3. Until that bucket exists, this transparently falls
// back to local disk with the exact same behavior as before, so nothing
// breaks before the AWS side is ready — see the boot-time warning below.
const S3_BUCKET = process.env.AWS_S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';

const isS3Enabled = (): boolean => Boolean(S3_BUCKET);

let warnedOnce = false;
const warnDiskFallback = (): void => {
  if (warnedOnce || isS3Enabled()) return;
  warnedOnce = true;
  console.warn(
    '[uploads] AWS_S3_BUCKET is not set — files are stored on local disk and will NOT survive a restart or redeploy (ARCH-06). Set AWS_S3_BUCKET once the bucket exists.'
  );
};

const UPLOADS_ROOT = path.join(__dirname, '../uploads');
const localDir = (subdir: string): string => path.join(UPLOADS_ROOT, subdir);
const localPath = (subdir: string, storedName: string): string => path.join(localDir(subdir), storedName);

/** Same naming convention every upload route already used: `<prefix>_<userId>_<timestamp><ext>`. */
const generateStoredFilename = (prefix: string, userId: number | string | undefined, originalName: string): string => {
  const ext = path.extname(originalName).toLowerCase();
  return `${prefix}_${userId ?? 'u'}_${Date.now()}${ext}`;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let s3Client: any;
const getS3 = async () => {
  if (!s3Client) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    s3Client = new S3Client({ region: AWS_REGION });
  }
  return s3Client;
};

/** Writes a just-uploaded buffer to its permanent home (S3 or local disk). */
const persistUploadedFile = async (
  subdir: string,
  storedName: string,
  buffer: Buffer,
  mimetype: string
): Promise<void> => {
  if (isS3Enabled()) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3();
    await client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: `${subdir}/${storedName}`,
      Body: buffer,
      ContentType: mimetype,
      ServerSideEncryption: 'AES256',
    }));
    return;
  }
  warnDiskFallback();
  const dir = localDir(subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(localPath(subdir, storedName), buffer);
};

interface ServeOptions {
  /** Overrides the served Content-Type (defaults to whatever the file was stored with). */
  contentType?: string;
  /** If set, served `inline; filename="..."` instead of the browser's default. */
  inlineFilename?: string;
}

/** Serves a previously-stored file: redirects to a short-lived signed S3 URL, or sends the local file. */
const sendStoredFile = async (res: Response, subdir: string, storedName: string, opts: ServeOptions = {}): Promise<void> => {
  const disposition = opts.inlineFilename ? `inline; filename="${opts.inlineFilename}"` : undefined;

  if (isS3Enabled()) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const client = await getS3();
    try {
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: `${subdir}/${storedName}`,
          ResponseContentType: opts.contentType,
          ResponseContentDisposition: disposition,
        }),
        { expiresIn: 300 }
      );
      res.redirect(302, url);
    } catch {
      res.status(404).json({ message: 'File not found' });
    }
    return;
  }
  const filePath = localPath(subdir, storedName);
  if (!fs.existsSync(filePath)) { res.status(404).json({ message: 'File not found' }); return; }
  if (opts.contentType) res.setHeader('Content-Type', opts.contentType);
  if (disposition) res.setHeader('Content-Disposition', disposition);
  res.sendFile(filePath);
};

/** Removes a previously-stored file — used when replacing or deleting an upload. */
const deleteStoredFile = async (subdir: string, storedName: string): Promise<void> => {
  if (isS3Enabled()) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3();
    await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: `${subdir}/${storedName}` })).catch(() => {});
    return;
  }
  const filePath = localPath(subdir, storedName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

export { isS3Enabled, generateStoredFilename, persistUploadedFile, sendStoredFile, deleteStoredFile };
