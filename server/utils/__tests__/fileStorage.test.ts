import fs from 'fs';
import path from 'path';
import { Response } from 'express';
import { isS3Enabled, createUploadStorage, streamUploadToResponse, deleteUpload } from '../fileStorage';

// PRO-05: disk mode (AWS_S3_BUCKET unset) must behave exactly like the old
// hardcoded multer.diskStorage setup — this is what every local dev/CI run
// actually exercises, since none of them have an AWS account configured.
describe('fileStorage (disk mode — AWS_S3_BUCKET unset)', () => {
  const testDir = path.join(__dirname, '../../uploads/__test-subdir__');

  beforeEach(() => { delete process.env.AWS_S3_BUCKET; });
  afterEach(() => { if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true }); });

  it('reports S3 disabled when AWS_S3_BUCKET is unset', () => {
    expect(isS3Enabled()).toBe(false);
  });

  it('returns a disk-backed multer storage engine', () => {
    const storage = createUploadStorage('__test-subdir__', 'rx');
    expect(typeof storage._handleFile).toBe('function');
    expect(fs.existsSync(testDir)).toBe(true); // destination dir created eagerly, same as before
  });

  it('streamUploadToResponse returns false (not found) for a missing file, without throwing', async () => {
    const res = { setHeader: jest.fn(), sendFile: jest.fn() } as unknown as Response;
    const found = await streamUploadToResponse(res, '__test-subdir__', 'does-not-exist.pdf');
    expect(found).toBe(false);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('streamUploadToResponse serves an existing file and sets the given headers', async () => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'present.pdf'), '%PDF-1.4');

    const res = { setHeader: jest.fn(), sendFile: jest.fn() } as unknown as Response;
    const found = await streamUploadToResponse(res, '__test-subdir__', 'present.pdf', { mimetype: 'application/pdf' });

    expect(found).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.sendFile).toHaveBeenCalledWith(path.join(testDir, 'present.pdf'));
  });

  it('deleteUpload is a safe no-op for a file that does not exist', async () => {
    await expect(deleteUpload('__test-subdir__', 'never-existed.pdf')).resolves.not.toThrow();
  });

  it('deleteUpload removes an existing file', async () => {
    fs.mkdirSync(testDir, { recursive: true });
    const filePath = path.join(testDir, 'to-delete.pdf');
    fs.writeFileSync(filePath, '%PDF-1.4');

    await deleteUpload('__test-subdir__', 'to-delete.pdf');

    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('deleteUpload is a no-op when given no filename', async () => {
    await expect(deleteUpload('__test-subdir__', null)).resolves.not.toThrow();
    await expect(deleteUpload('__test-subdir__', undefined)).resolves.not.toThrow();
  });
});
