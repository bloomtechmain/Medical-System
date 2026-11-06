// Report upload in S3 mode (production) and the report-reading fixes:
// the file-type check used to read file.path, which S3 mode never sets, so
// every upload failed with a 500; and blurred photos produced wrong values.
import { Readable } from 'stream';
import { Request, Response } from 'express';
import { Block } from '@aws-sdk/client-textract';

const send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send })),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn((input: unknown) => ({ input })),
}));
// Stand-in for the S3 multipart upload: drain the body, as S3 would.
jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn(({ params }: { params: { Body: Readable } }) => ({
    done: () => new Promise<void>((resolve, reject) => {
      params.Body.on('data', () => {}).on('end', () => resolve()).on('error', reject);
    }),
  })),
}));

process.env.AWS_S3_BUCKET = 'test-bucket';
const { createUploadStorage } = require('../fileStorage');
const { verifyUploadSignature } = require('../uploadSecurity');
import { extractVitalsFromText, voteVitals } from '../labVitalsParser';
import { blocksToText, MIN_NUMBER_CONFIDENCE } from '../textractOcr';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);

const storeViaS3 = (content: Buffer): Promise<Express.Multer.File> => new Promise((resolve, reject) => {
  const storage = createUploadStorage('patient-reports', 'report');
  const file = { originalname: 'cbc.png', mimetype: 'image/png', stream: Readable.from([content.subarray(0, 5), content.subarray(5)]) };
  storage._handleFile({ user: { id: 7 } } as unknown as Request, file as unknown as Express.Multer.File, (err: Error | null, info: Partial<Express.Multer.File>) =>
    err ? reject(err) : resolve({ ...file, ...info } as Express.Multer.File));
});

const runCheck = (file: Express.Multer.File): Promise<{ next: jest.Mock; res: { status: jest.Mock; json: jest.Mock } }> =>
  new Promise(resolve => {
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    const next: jest.Mock = jest.fn((): void => resolve({ next, res }));
    res.json.mockImplementation(() => { resolve({ next, res }); return res; });
    verifyUploadSignature({ required: true })({ file } as unknown as Request, res as unknown as Response, next);
  });

describe('report upload in S3 mode', () => {
  beforeEach(() => send.mockReset().mockResolvedValue({}));

  it('records the size and first bytes while streaming to S3', async () => {
    const file = await storeViaS3(PNG);
    expect(file.path).toBeUndefined();
    expect(file.size).toBe(PNG.length);
    expect(file.headBytes?.subarray(0, 8)).toEqual(PNG.subarray(0, 8));
    expect(file.storageSubdir).toBe('patient-reports');
  });

  it('accepts a real image without touching the disk (was a 500)', async () => {
    const { next, res } = await runCheck(await storeViaS3(PNG));
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('refuses a disguised file and deletes it from S3', async () => {
    const { res } = await runCheck(await storeViaS3(Buffer.from('MZ this is not an image at all')));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ Bucket: 'test-bucket' }) }));
  });
});

describe('report reading: wrong values are worse than missing ones', () => {
  it('reads LEUKOCYTE (with a k) and ignores the differential heading', () => {
    const v = extractVitalsFromText([
      'TOTAL LEUKOCYTE COUNT    5,100    cumm    4,800- 10,800',
      'DIFFERENTIAL LEUCOCYTE COUNT',
      'NEUTROPHILS    79    %    40 80',
    ].join('\n'));
    expect(v.wbc).toBe(5.1);
  });

  it('does not take the absolute leucocyte heading or a blurred-to-zero result', () => {
    const v = extractVitalsFromText([
      'Total Leucocyte Count    0000    4000 10000    /cumm',
      'Absolute Leucocyte Count',
      'Absolute Neutrophils    2500.00    2000-7000    /cumm',
    ].join('\n'));
    expect(v.wbc).toBeUndefined();
  });

  it('reads RDW-CV but not RDW-SD (or its misread "RDW-5D")', () => {
    expect(extractVitalsFromText('RDW-CV    12    11.6 - 14.0    %').rdw).toBe(12);
    expect(extractVitalsFromText('RDW-5D    42    39 - 46    fL').rdw).toBeUndefined();
    expect(extractVitalsFromText('RDW-SD    42    39 - 46    fL').rdw).toBeUndefined();
  });

  it('drops a value only one low-confidence OCR pass read', () => {
    const v = voteVitals([
      { vitals: { hemoglobin: 8 }, confidence: 30 },
      { vitals: {}, confidence: 29 },
      { vitals: { hemoglobin: 15, mcv: 80 }, confidence: 40 },
      { vitals: { hemoglobin: 15 }, confidence: 35 },
    ], { corroborate: true });
    expect(v).toEqual({ hemoglobin: 15 });
  });

  it('keeps a single confident read (a clean page where other passes missed the row)', () => {
    expect(voteVitals([{ vitals: { mcv: 84 }, confidence: 90 }, { vitals: {}, confidence: 88 }], { corroborate: true })).toEqual({ mcv: 84 });
  });
});

describe('Textract page to rows', () => {
  let n = 0;
  const line = (words: [string, number][], x: number, y: number, tilt = 0): Block[] => {
    const ids = words.map(() => `w${++n}`);
    const w = 0.02 * words.map(([t]) => t).join(' ').length;
    const poly = [{ X: x, Y: y }, { X: x + w, Y: y + w * tilt }, { X: x + w, Y: y + w * tilt + 0.012 }, { X: x, Y: y + 0.012 }];
    return [
      { BlockType: 'LINE', Text: words.map(([t]) => t).join(' '), Geometry: { Polygon: poly }, Relationships: [{ Type: 'CHILD', Ids: ids }] } as Block,
      ...words.map(([t, c], i) => ({ BlockType: 'WORD', Id: ids[i], Text: t, Confidence: c } as Block)),
    ];
  };

  it('joins a tilted row back together and reads it', () => {
    const tilt = Math.tan(3 * Math.PI / 180);
    const blocks = [
      ...line([['Haemoglobin', 99]], 0.05, 0.30, tilt), ...line([['15', 99]], 0.45, 0.30 + 0.40 * tilt, tilt), ...line([['g/dL', 98]], 0.62, 0.30 + 0.57 * tilt, tilt),
      ...line([['MCV', 99]], 0.05, 0.34, tilt), ...line([['84.0', 97]], 0.45, 0.34 + 0.40 * tilt, tilt), ...line([['fL', 96]], 0.62, 0.34 + 0.57 * tilt, tilt),
    ];
    const v = extractVitalsFromText(blocksToText(blocks));
    expect(v).toEqual(expect.objectContaining({ hemoglobin: 15, mcv: 84 }));
  });

  it(`hides numbers Textract is unsure of (< ${MIN_NUMBER_CONFIDENCE}%)`, () => {
    const blocks = [...line([['MCV', 99]], 0.05, 0.5), ...line([['54.0', 61]], 0.45, 0.5), ...line([['fL', 90]], 0.62, 0.5)];
    expect(blocksToText(blocks)).toContain('?');
    expect(extractVitalsFromText(blocksToText(blocks)).mcv).toBeUndefined();
  });
});
