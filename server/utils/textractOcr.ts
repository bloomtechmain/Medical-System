// Amazon Textract as the OCR engine for report photos and scanned pages.
//
// Why: tesseract (reportOcr.ts) reads clean scans well, but on a blurred,
// small or tilted photo it either reads nothing or, worse, reads wrong
// digits. On the same degraded samples Textract read most values correctly
// in ~2 s (tesseract: 15-30 s, mostly nothing).
//
// On only when OCR_ENGINE=textract (production sets it; the task role needs
// textract:DetectDocumentText). Unset — local dev, CI, tests — nothing here
// runs and tesseract is used exactly as before. Any Textract failure returns
// null and the caller falls back to tesseract.
//
// Cost: DetectDocumentText is $1.50 per 1,000 pages.
import { TextractClient, DetectDocumentTextCommand, Block } from '@aws-sdk/client-textract';
import { logger } from '../config/logger';

export const isTextractEnabled = (): boolean => (process.env.OCR_ENGINE || '').trim().toLowerCase() === 'textract';

/** Numbers Textract itself is unsure of are treated as unreadable. On
 *  blurred samples every misread digit scored below this ("84.0" read as
 *  "54.0" at 61) while correctly read ones scored 80-100. A missing value
 *  is shown as missing; a wrong one would go into the patient's record. */
export const MIN_NUMBER_CONFIDENCE = 75;

/** Textract's synchronous API takes up to 10 MB of JPEG/PNG/TIFF/PDF. */
const MAX_BYTES = 10 * 1024 * 1024;

let client: TextractClient | null = null;
const getClient = (): TextractClient => {
  if (!client) client = new TextractClient({ region: process.env.AWS_REGION || 'ap-south-1' });
  return client;
};

interface Item { text: string; x: number; y: number; h: number }

/**
 * Rebuild the page as text lines, one table row per line ("Haemoglobin  15
 * g/dL  13-17"), which is the shape the vitals parser reads. Textract returns
 * each printed line on its own with its position, and a table cell is a line
 * of its own, so rows are re-formed by height. A photo taken at a slight
 * angle puts a row's value a little above or below its name; the page is
 * de-skewed first (median angle of the text lines) so they stay together.
 */
export const blocksToText = (blocks: Block[]): string => {
  const words = new Map<string, Block>();
  for (const b of blocks) if (b.BlockType === 'WORD' && b.Id) words.set(b.Id, b);

  const lines = blocks.filter(b => b.BlockType === 'LINE' && b.Geometry?.Polygon?.length === 4);
  const angles = lines
    .filter(l => (l.Text ?? '').length >= 4)
    .map(l => { const [a, b] = l.Geometry!.Polygon!; return Math.atan2((b.Y ?? 0) - (a.Y ?? 0), (b.X ?? 0) - (a.X ?? 0)); })
    .sort((p, q) => p - q);
  const angle = angles.length ? angles[Math.floor(angles.length / 2)] : 0;
  const cos = Math.cos(-angle), sin = Math.sin(-angle);

  const items: Item[] = lines.map(l => {
    // Words whose digits Textract is unsure of become "?": the parser then
    // treats that result as unreadable instead of using a guessed number.
    const ids = l.Relationships?.find(r => r.Type === 'CHILD')?.Ids ?? [];
    const text = ids.length
      ? ids.map(id => words.get(id)).filter((w): w is Block => !!w)
          .map(w => (/\d/.test(w.Text ?? '') && (w.Confidence ?? 0) < MIN_NUMBER_CONFIDENCE ? '?' : w.Text ?? ''))
          .join(' ')
      : l.Text ?? '';
    const p = l.Geometry!.Polygon!;
    const cx = p.reduce((s, q) => s + (q.X ?? 0), 0) / 4;
    const cy = p.reduce((s, q) => s + (q.Y ?? 0), 0) / 4;
    const h = Math.hypot((p[3].X ?? 0) - (p[0].X ?? 0), (p[3].Y ?? 0) - (p[0].Y ?? 0));
    return { text, x: cx * cos - cy * sin, y: cx * sin + cy * cos, h };
  });

  items.sort((a, b) => a.y - b.y);
  const rows: { y: number; h: number; items: Item[] }[] = [];
  for (const it of items) {
    const row = rows.find(r => Math.abs(r.y - it.y) < Math.max(r.h, it.h) * 0.55);
    if (row) row.items.push(it); else rows.push({ y: it.y, h: it.h, items: [it] });
  }
  // Wide gaps between cells, like a table, so "value unit range" stay apart.
  return rows.map(r => r.items.sort((a, b) => a.x - b.x).map(i => i.text).join('    ')).join('\n');
};

/** Mean confidence of the page's words, 0-100. */
const pageConfidence = (blocks: Block[]): number => {
  const c = blocks.filter(b => b.BlockType === 'WORD').map(b => b.Confidence ?? 0);
  return c.length ? c.reduce((s, x) => s + x, 0) / c.length : 0;
};

/**
 * Read one image (JPEG or PNG bytes). Returns null when Textract is off,
 * refuses the image, or fails — the caller then uses tesseract.
 */
export const textractImage = async (bytes: Buffer): Promise<{ text: string; confidence: number } | null> => {
  if (!isTextractEnabled() || bytes.length > MAX_BYTES) return null;
  try {
    const out = await getClient().send(new DetectDocumentTextCommand({ Document: { Bytes: bytes } }));
    const blocks = out.Blocks ?? [];
    return { text: blocksToText(blocks), confidence: pageConfidence(blocks) };
  } catch (err) {
    logger.warn({ err: { name: (err as Error).name, message: (err as Error).message } }, 'Textract could not read the image; using tesseract');
    return null;
  }
};
