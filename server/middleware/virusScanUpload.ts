import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { scanFile, isScanningEnabled, failOpen } from '../utils/virusScan';
import { deleteUpload, readUploadToTempFile } from '../utils/fileStorage';
import { audit, AuditAction } from '../utils/auditLog';

// PRO-07: scans an uploaded file before the controller is allowed to attach
// it to a clinical record.
//
// Runs AFTER multer and after verifyUploadSignature, which means the bytes
// are already written to disk or S3 by the time we look at them. That is
// multer's design, not a choice here, and the audit flags it separately. The
// consequence is that this middleware's real job is to *delete* a bad upload,
// not to prevent it being written — so every rejection path below removes the
// file rather than leaving an infected orphan in storage.
const virusScanUpload = (subdir: string) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) { next(); return; }

    if (!isScanningEnabled()) {
      // Logged every time rather than once at boot: this is a health system
      // accepting arbitrary files from the internet, and "no scanning
      // configured" should be impossible to miss in the logs.
      logger.warn(
        { subdir, filename: file.filename },
        'Upload accepted without a virus scan — CLAMAV_HOST is not set (PRO-07)'
      );
      next();
      return;
    }

    // With S3 the object is already remote, so it has to come back to a temp
    // file to be streamed at clamd. cleanup() is a no-op for local disk,
    // where filePath is the real stored path — so take care NOT to let the
    // cleanup delete a legitimately stored local file.
    let temp: { filePath: string; cleanup: () => void } | null = null;
    const discardStoredFile = async (): Promise<void> => {
      try {
        await deleteUpload(subdir, file.filename);
        // Local disk: deleteUpload already removed the stored file, so the
        // path temp points at is gone too.
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch (err) {
        logger.error({ err, filename: file.filename }, 'Could not delete rejected upload');
      }
    };

    try {
      temp = await readUploadToTempFile(subdir, file.filename);
      const result = await scanFile(temp.filePath);

      if (result.scanned && result.clean) { next(); return; }

      if (result.scanned && !result.clean) {
        // A real detection. Delete it, record it, and tell the uploader
        // plainly — they may well have an infected machine, which is more
        // useful to them than a generic error.
        await discardStoredFile();
        logger.error(
          { subdir, filename: file.filename, signature: result.signature, userId: req.user?.id },
          'Malware detected in upload — file rejected and deleted'
        );
        audit(req, {
          action: AuditAction.UPLOAD_REJECTED_MALWARE,
          outcome: 'denied',
          targetType: 'upload',
          metadata: { subdir, signature: result.signature },
        });
        res.status(422).json({
          message: 'This file was rejected because it appears to contain malware. Please scan your device and try again with a clean copy.',
        });
        return;
      }

      // Scanning could not be completed. See utils/virusScan.ts for why the
      // default is to reject: a clamd outage must not silently become "no
      // scanning" while everything still reports healthy.
      logger.error(
        { subdir, filename: file.filename, reason: result.reason, failOpen: failOpen() },
        'Virus scan could not be completed'
      );
      if (failOpen()) { next(); return; }

      await discardStoredFile();
      res.status(503).json({
        message: 'File scanning is temporarily unavailable, so the upload was not accepted. Please try again shortly.',
      });
    } catch (err) {
      // An unexpected error here is the same situation as a failed scan: the
      // file has not been shown to be clean.
      logger.error({ err, subdir, filename: file.filename }, 'Virus scan middleware failed');
      if (failOpen()) { next(); return; }
      await discardStoredFile();
      res.status(503).json({
        message: 'File scanning is temporarily unavailable, so the upload was not accepted. Please try again shortly.',
      });
    } finally {
      // Only removes the S3 temp copy; a no-op for local storage.
      temp?.cleanup();
    }
  };

export { virusScanUpload };
