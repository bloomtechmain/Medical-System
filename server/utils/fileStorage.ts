import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { Response } from 'express';
import multer from 'multer';
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { randomUploadName } from './uploadSecurity';

// PRO-05: uploads (prescriptions, lab reports/referrals, patient reports) were
// written to the application's own disk — fine for a single Railway
// instance, but breaks the moment more than one task/container runs (AWS
// ECS Fargate, the actual deploy target), since each task has its own
// ephemeral filesystem. S3 is used whenever AWS_S3_BUCKET is set; local disk
// (the exact previous behaviour) stays the path when it's unset, so local
// dev and CI need no AWS account at all.
const BUCKET = process.env.AWS_S3_BUCKET;
const isS3Enabled = (): boolean => !!BUCKET;

// Credentials come from the environment's normal AWS credential chain — an
// ECS task role in production, `aws configure`/env vars for anyone testing
// S3 mode locally. Never hardcode a key/secret here or in .env.
let s3Client: S3Client | null = null;
const getS3 = (): S3Client => {
  if (!s3Client) s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  return s3Client;
};

const localDir = (subdir: string): string => {
  const dir = path.join(__dirname, '../uploads', subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/**
 * multer storage engine for one upload subdirectory (e.g. "prescriptions").
 * Disk mode is exactly the pre-existing behaviour. S3 mode streams the
 * incoming file straight into the bucket (no local disk round-trip) under
 * key `${subdir}/${randomName}` — `req.file.filename` is set to just the
 * random name in both modes, so every DB column that stores it (
 * `prescription_file`, `report_file`, `file_path`, ...) keeps the same
 * meaning regardless of backend; only the subdir (implied by which column/
 * table it is) is needed to resolve it back to a full path or S3 key.
 */
const createUploadStorage = (subdir: string, filenamePrefix: string): multer.StorageEngine => {
  if (!isS3Enabled()) {
    return multer.diskStorage({
      destination: localDir(subdir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, randomUploadName(filenamePrefix, req.user?.id || 'u', ext));
      },
    });
  }

  return {
    _handleFile(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const name = randomUploadName(filenamePrefix, req.user?.id || 'u', ext);
      const upload = new Upload({
        client: getS3(),
        params: { Bucket: BUCKET, Key: `${subdir}/${name}`, Body: file.stream, ContentType: file.mimetype },
      });
      upload.done()
        .then(() => cb(null, { filename: name, size: (file as unknown as { size?: number }).size }))
        .catch(cb);
    },
    _removeFile(_req, file, cb) {
      const key = `${subdir}/${(file as Express.Multer.File).filename}`;
      getS3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).then(() => cb(null)).catch(cb);
    },
  };
};

/**
 * Resolves a stored filename back to a real local path some code can read
 * (OCR/PDF parsing need an actual file, not a stream) — the already-local
 * path in disk mode, or a temp-downloaded copy in S3 mode. Always call
 * `cleanup()` when done; it's a no-op in disk mode so callers don't need an
 * `if (isS3Enabled())` of their own.
 */
const readUploadToTempFile = async (
  subdir: string,
  filename: string
): Promise<{ filePath: string; cleanup: () => void }> => {
  if (!isS3Enabled()) {
    return { filePath: path.join(localDir(subdir), filename), cleanup: () => {} };
  }

  const tempPath = path.join(os.tmpdir(), `${crypto.randomBytes(8).toString('hex')}_${filename}`);
  const obj = await getS3().send(new GetObjectCommand({ Bucket: BUCKET, Key: `${subdir}/${filename}` }));
  await new Promise<void>((resolve, reject) => {
    const ws = fs.createWriteStream(tempPath);
    (obj.Body as NodeJS.ReadableStream).pipe(ws).on('finish', resolve).on('error', reject);
  });
  return { filePath: tempPath, cleanup: () => { try { fs.unlinkSync(tempPath); } catch { /* already gone */ } } };
};

/** Streams a stored file straight into an HTTP response. Returns false (caller 404s) if it doesn't exist. */
const streamUploadToResponse = async (
  res: Response,
  subdir: string,
  filename: string,
  opts: { mimetype?: string; originalName?: string } = {}
): Promise<boolean> => {
  if (opts.mimetype) res.setHeader('Content-Type', opts.mimetype);
  if (opts.originalName) res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(opts.originalName)}"`);

  if (!isS3Enabled()) {
    const filePath = path.join(localDir(subdir), filename);
    if (!fs.existsSync(filePath)) return false;
    res.sendFile(filePath);
    return true;
  }

  try {
    const obj = await getS3().send(new GetObjectCommand({ Bucket: BUCKET, Key: `${subdir}/${filename}` }));
    if (!opts.mimetype && obj.ContentType) res.setHeader('Content-Type', obj.ContentType);
    (obj.Body as NodeJS.ReadableStream).pipe(res);
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === 'NoSuchKey') return false;
    throw err;
  }
};

/** Deletes a stored file. Safe to call on a file that doesn't exist (matches the old fs.existsSync-guarded unlink). */
const deleteUpload = async (subdir: string, filename: string | null | undefined): Promise<void> => {
  if (!filename) return;
  if (!isS3Enabled()) {
    const filePath = path.join(localDir(subdir), filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }
  await getS3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: `${subdir}/${filename}` }));
};

export { isS3Enabled, createUploadStorage, readUploadToTempFile, streamUploadToResponse, deleteUpload };
