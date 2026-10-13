import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';
import { logger } from '../config/logger';
import { deleteUpload } from '../utils/fileStorage';

// COST-04/PRO-07: uploads were capped at 20 MB each with no limit on how many
// a user could send and no storage quota at all. uploadLimiter already bounds
// the *rate* (20/minute); this bounds the *total*, which is the part that
// costs money — each stored file is storage billed monthly, and each upload
// can start CPU-heavy OCR.
//
// Two ceilings, because they catch different abuse:
//   - a rolling 24h byte budget, which stops a sustained drip that no
//     per-minute rate limit would notice;
//   - a lifetime live-bytes budget, which stops an account simply
//     accumulating storage forever.
//
// Deliberately generous: a patient with years of lab reports must not hit
// these, so they are sized to catch abuse rather than to ration normal use.
const DAILY_BYTES = parseInt(process.env.UPLOAD_QUOTA_DAILY_BYTES || `${500 * 1024 * 1024}`, 10);
const TOTAL_BYTES = parseInt(process.env.UPLOAD_QUOTA_TOTAL_BYTES || `${2 * 1024 * 1024 * 1024}`, 10);

interface Usage {
  daily: number;
  total: number;
}

const currentUsage = async (userId: number): Promise<Usage> => {
  const { rows } = await pool.query<{ daily: string; total: string }>(
    `SELECT COALESCE(SUM(bytes) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours'), 0) AS daily,
            COALESCE(SUM(bytes), 0)                                                          AS total
     FROM public.upload_usage
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  return { daily: Number(rows[0].daily), total: Number(rows[0].total) };
};

// Multer has already written the file to disk (or S3) by the time any
// middleware can see its size — that is how multer works, and PRO-07 notes it
// as a flaw in its own right ("a file is written to disk before the request is
// validated and is not removed if the request is then rejected"). So this
// middleware's job is to reject *and clean up*, never to leave the orphan
// behind. Same pattern as verifyUploadSignature.
const enforceUploadQuota = (subdir: string) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const file = req.file as Express.Multer.File | undefined;
    if (!file || !req.user?.id) { next(); return; }

    const bytes = file.size ?? 0;

    const discard = async (): Promise<void> => {
      // file.path exists for local disk; the S3 storage engine sets filename.
      try {
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        else await deleteUpload(subdir, file.filename);
      } catch (err) {
        logger.warn({ err, filename: file.filename }, 'Could not remove over-quota upload');
      }
    };

    try {
      const usage = await currentUsage(req.user.id);

      if (usage.daily + bytes > DAILY_BYTES) {
        await discard();
        res.status(413).json({
          message: 'Daily upload limit reached. Please try again tomorrow or contact support.',
        });
        return;
      }
      if (usage.total + bytes > TOTAL_BYTES) {
        await discard();
        res.status(413).json({
          message: 'Storage limit reached for this account. Please remove old files or contact support.',
        });
        return;
      }

      // Record it. Done before the controller runs so the bytes are counted
      // even if the controller then fails — otherwise a request that uploads
      // a file and errors afterwards would leave storage consumed and
      // unaccounted, which is exactly the orphan case this table exists to
      // make visible.
      await pool.query(
        `INSERT INTO public.upload_usage (user_id, subdir, filename, bytes) VALUES ($1,$2,$3,$4)`,
        [req.user.id, subdir, file.filename, bytes]
      );

      next();
    } catch (err) {
      // A quota-check failure must not block a clinical upload. Log it and
      // let the upload through: refusing a lab report because an accounting
      // table was unreachable is the wrong trade for a medical system.
      logger.error({ err, userId: req.user.id }, 'Upload quota check failed — allowing the upload');
      next();
    }
  };

// Called when a record (and its file) is deleted, so the storage stops
// counting against the user's quota. The row survives as a record of the
// upload having happened.
const releaseUploadUsage = async (subdir: string, filename: string | null | undefined): Promise<void> => {
  if (!filename) return;
  try {
    await pool.query(
      `UPDATE public.upload_usage SET deleted_at = NOW()
       WHERE subdir = $1 AND filename = $2 AND deleted_at IS NULL`,
      [subdir, filename]
    );
  } catch (err) {
    logger.warn({ err, subdir, filename }, 'Could not release upload usage');
  }
};

export { enforceUploadQuota, releaseUploadUsage, currentUsage, DAILY_BYTES, TOTAL_BYTES };
