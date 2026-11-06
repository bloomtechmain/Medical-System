/**
 * Robust OCR for uploaded medical reports (phone photos, scans, faxes).
 *
 * Plain tesseract on a raw phone photo of a lab report fails in predictable
 * ways: the image is small or soft (blur), the paper is grey under uneven
 * lighting (a shadow across half the page), the print is low-contrast, and
 * the page is a table that tesseract's default "auto" layout splits into
 * columns — so the test name and its value end up on different lines and
 * the parser can no longer pair them.
 *
 * This module fixes those before and after tesseract runs:
 *
 *   1. Pre-processing (pure JS on the decoded pixels — no extra native deps;
 *      decoding/encoding uses the @napi-rs/canvas build that pdfjs already
 *      ships, see renderPdfPageToPNG in labVitalsParser.ts for why it must be
 *      that copy):
 *        - rescale so text is ~300 dpi-equivalent (upscale small/blurry
 *          photos, downscale huge ones so memory stays bounded),
 *        - grayscale + percentile contrast stretch,
 *        - unsharp-mask sharpening (recovers soft/blurred glyph edges),
 *        - a second variant binarised with a local (Sauvola) threshold,
 *          which removes shadows and uneven lighting.
 *   2. Several tesseract passes with layouts suited to tabular reports
 *      (PSM 6 = uniform block keeps "Name  value  unit  range" on one line,
 *      PSM 4 = single column of variable-size text), reusing one worker.
 *   3. The caller parses each pass and votes per field (see
 *      extractVitalsFromReport in labVitalsParser.ts), so one pass misreading
 *      "14.5" as "14.6" or "1.45" is out-voted by the others.
 */
import fs from 'fs';
import path from 'path';

export interface OcrPass {
  variant: 'enhanced' | 'binarized' | 'deblurred' | 'original';
  psm: string;
  text: string;
  /** Tesseract's mean word confidence for the pass, 0–100. */
  confidence: number;
  /** Only fills fields no regular pass read; never out-votes them. */
  fallback?: boolean;
}

type CanvasModule = {
  createCanvas: (w: number, h: number) => any;
  loadImage: (src: Buffer) => Promise<any>;
};

const loadCanvas = async (): Promise<CanvasModule | null> => {
  try {
    // Same nested copy pdfjs uses — see the module comment.
    return await import('pdfjs-dist/node_modules/@napi-rs/canvas') as unknown as CanvasModule;
  } catch {
    try { return await import('@napi-rs/canvas') as unknown as CanvasModule; } catch { return null; }
  }
};

// Target size of the longer image side. A phone photo of an A4 report at
// ~2400–3000 px gives body text roughly 25–35 px tall, which is where the
// LSTM engine is most accurate; much smaller and blurred glyphs merge, much
// larger and processing time/memory grow with no accuracy gain.
const TARGET_LONG_SIDE = 2800;
const MAX_UPSCALE = 3;
const MAX_LONG_SIDE = 4000;

interface Gray { w: number; h: number; px: Uint8ClampedArray }

const toGray = (rgba: Uint8ClampedArray, w: number, h: number): Gray => {
  const px = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < px.length; i++, j += 4) {
    // Transparent pixels (PNG screenshots) read as white paper, not black.
    const a = rgba[j + 3] / 255;
    const l = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    px[i] = l * a + 255 * (1 - a);
  }
  return { w, h, px };
};

/** Stretch the 1st–99th percentile to the full 0–255 range. */
const stretchContrast = (g: Gray): void => {
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.px.length; i++) hist[g.px[i]]++;
  const total = g.px.length;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.01) { hi = v; break; } }
  if (hi - lo < 10) return; // blank or already flat — nothing to stretch
  const scale = 255 / (hi - lo);
  for (let i = 0; i < g.px.length; i++) g.px[i] = (g.px[i] - lo) * scale;
};

/** Separable box blur with the given radius (used by the unsharp mask). */
const boxBlur = (g: Gray, r: number): Float32Array => {
  const { w, h, px } = g;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) sum += px[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / win;
      sum += px[row + Math.min(w - 1, x + r + 1)] - px[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / win;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
};

/** Unsharp mask: out = img + amount * (img - blur(img)). */
const sharpen = (g: Gray, radius: number, amount: number): void => {
  const blur = boxBlur(g, radius);
  for (let i = 0; i < g.px.length; i++) g.px[i] = g.px[i] + amount * (g.px[i] - blur[i]);
};

/**
 * Sauvola local threshold via integral images — each pixel is compared with
 * the mean/stddev of its own neighbourhood rather than one global cut-off,
 * so a shadow over half the page doesn't turn that half solid black.
 */
const sauvola = (g: Gray, window: number, k = 0.2): Gray => {
  const { w, h, px } = g;
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  const sq  = new Float64Array(W * (h + 1));
  for (let y = 1; y <= h; y++) {
    let rs = 0, rq = 0;
    for (let x = 1; x <= w; x++) {
      const v = px[(y - 1) * w + (x - 1)];
      rs += v; rq += v * v;
      sum[y * W + x] = sum[(y - 1) * W + x] + rs;
      sq[y * W + x]  = sq[(y - 1) * W + x]  + rq;
    }
  }
  const half = Math.max(7, Math.floor(window / 2));
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(w - 1, x + half);
      const n = (x1 - x0 + 1) * (y1 - y0 + 1);
      const a = (y1 + 1) * W + (x1 + 1), b = y0 * W + (x1 + 1), c = (y1 + 1) * W + x0, d = y0 * W + x0;
      const s = sum[a] - sum[b] - sum[c] + sum[d];
      const q = sq[a]  - sq[b]  - sq[c]  + sq[d];
      const mean = s / n;
      const sd = Math.sqrt(Math.max(0, q / n - mean * mean));
      const t = mean * (1 + k * (sd / 128 - 1));
      out[y * w + x] = px[y * w + x] > t ? 255 : 0;
    }
  }
  return { w, h, px: out };
};

const grayToPng = (cv: CanvasModule, g: Gray): Buffer => {
  const canvas = cv.createCanvas(g.w, g.h);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(g.w, g.h);
  for (let i = 0, j = 0; i < g.px.length; i++, j += 4) {
    img.data[j] = img.data[j + 1] = img.data[j + 2] = g.px[i];
    img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toBuffer('image/png');
};

export interface PreparedImages { enhanced: Buffer; binarized: Buffer; deblurred: Buffer }

/**
 * Decode an image buffer and produce the two cleaned-up variants.
 * Returns null if the image can't be decoded (corrupt/unsupported) — the
 * caller then falls back to OCR on the original bytes.
 */
export const prepareImageForOcr = async (input: Buffer): Promise<PreparedImages | null> => {
  const cv = await loadCanvas();
  if (!cv) return null;
  try {
    const image = await cv.loadImage(input);
    const srcW = image.width as number, srcH = image.height as number;
    if (!srcW || !srcH) return null;

    const longSide = Math.max(srcW, srcH);
    let scale = TARGET_LONG_SIDE / longSide;
    scale = Math.min(scale, MAX_UPSCALE, MAX_LONG_SIDE / longSide);
    if (scale > 0.9 && scale < 1.1) scale = 1;
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const canvas = cv.createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    // Bicubic-quality resampling — upscaling with nearest-neighbour would add
    // jagged edges that read worse than the original blur.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, w, h);
    const gray = toGray(ctx.getImageData(0, 0, w, h).data, w, h);

    stretchContrast(gray);
    // Upscaling stretches the photo's blur by the same factor, so the blur
    // radius to undo grows with `scale`.
    const blurRadius = Math.max(2, Math.round(Math.max(1, scale) * 1.5));
    const strong: Gray = { w, h, px: new Uint8ClampedArray(gray.px) };

    // Moderate: wide + narrow sharpening, gentle enough that JPEG noise is
    // not amplified into speckle on an already-sharp photo.
    sharpen(gray, Math.max(2, Math.round(w / 900)), 0.8);
    sharpen(gray, 1, 0.6);
    const enhanced = grayToPng(cv, gray);
    const binarized = grayToPng(cv, sauvola(gray, Math.round(Math.max(w, h) / 45)));

    // Strong: for an out-of-focus or shaken photo. Two rounds at the blur's
    // own radius pull soft strokes apart so "8" and "6", "." and nothing,
    // stop merging; then re-stretch since sharpening shifts the histogram.
    sharpen(strong, blurRadius, 1.6);
    sharpen(strong, Math.max(1, Math.round(blurRadius / 2)), 1.2);
    stretchContrast(strong);
    const deblurred = grayToPng(cv, sauvola(strong, Math.round(Math.max(w, h) / 40), 0.25));
    return { enhanced, binarized, deblurred };
  } catch {
    return null;
  }
};

/**
 * The image as JPEG or PNG bytes under ~10 MB, the form Amazon Textract
 * accepts. JPEG/PNG pass through unchanged; WebP/BMP/GIF/TIFF are re-encoded
 * as PNG, and an oversized image is scaled down. Null if it can't be decoded.
 */
export const asJpegOrPng = async (input: Buffer, maxBytes = 9.5 * 1024 * 1024): Promise<Buffer | null> => {
  const isJpeg = input[0] === 0xff && input[1] === 0xd8;
  const isPng = input.subarray(0, 4).toString('latin1') === '\x89PNG';
  if ((isJpeg || isPng) && input.length <= maxBytes) return input;
  const cv = await loadCanvas();
  if (!cv) return null;
  try {
    const image = await cv.loadImage(input);
    let scale = 1;
    for (let i = 0; i < 4; i++) {
      const w = Math.max(1, Math.round(image.width * scale)), h = Math.max(1, Math.round(image.height * scale));
      const canvas = cv.createCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(image, 0, 0, w, h);
      const out: Buffer = canvas.toBuffer('image/jpeg', 92);
      if (out.length <= maxBytes) return out;
      scale *= 0.7;
    }
    return null;
  } catch {
    return null;
  }
};

type TessWorker = {
  setParameters: (p: Record<string, string>) => Promise<unknown>;
  recognize: (img: Buffer | string) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
};

// The English model ships in the image (Dockerfile: /app/tessdata) and sits
// at server/eng.traineddata in a checkout. Use it from disk; only when
// neither exists does tesseract.js fall back to downloading it.
const localLangPath = (): string | undefined => {
  const candidates = [
    process.env.TESSDATA_DIR,
    path.join(process.cwd(), 'tessdata'),
    process.cwd(),
    path.join(__dirname, '..'),
  ].filter((d): d is string => !!d);
  return candidates.find(d => fs.existsSync(path.join(d, 'eng.traineddata')));
};

const createOcrWorker = async (): Promise<TessWorker | null> => {
  try {
    const { createWorker } = await import('tesseract.js');
    const langPath = localLangPath();
    const opts = langPath
      ? { logger: () => {}, langPath, gzip: false, cacheMethod: 'none' }
      : { logger: () => {} };
    return await createWorker('eng', 1, opts) as unknown as TessWorker;
  } catch (err) {
    console.error('OCR worker failed to start:', (err as Error).message);
    return null;
  }
};

const recognizeWith = async (worker: TessWorker, img: Buffer | string, psm: string): Promise<{ text: string; confidence: number }> => {
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: psm,
      // Keeps the column gaps of a table as runs of spaces, so the parser
      // sees "Haemoglobin    14.5   g/dL" rather than a mashed-up line.
      preserve_interword_spaces: '1',
      // Phone photos carry no (or a bogus 72) dpi; telling tesseract the
      // rescaled image is ~300 dpi stops it guessing glyph size wrongly.
      user_defined_dpi: '300',
    });
    const { data } = await worker.recognize(img);
    return { text: data.text || '', confidence: data.confidence ?? 0 };
  } catch {
    return { text: '', confidence: 0 };
  }
};

export interface MultiPassOptions {
  /** Stop after the first two passes when both are at least this confident. */
  confidentEnough?: number;
}

/**
 * Run the multi-pass OCR on one image. Always returns at least one pass
 * (possibly with empty text) unless tesseract itself could not start.
 */
export const ocrImageMultiPass = async (input: Buffer, opts: MultiPassOptions = {}): Promise<OcrPass[]> => {
  const worker = await createOcrWorker();
  if (!worker) return [];
  const confidentEnough = opts.confidentEnough ?? 85;
  const passes: OcrPass[] = [];
  try {
    const prepared = await prepareImageForOcr(input);
    const run = async (variant: OcrPass['variant'], img: Buffer, psm: string): Promise<OcrPass> => {
      const pass: OcrPass = { variant, psm, ...(await recognizeWith(worker, img, psm)) };
      passes.push(pass);
      return pass;
    };
    // A pass only counts as a confident read if it also produced a
    // meaningful amount of numbers: tesseract reports high confidence on the
    // few words it *could* read from a badly blurred page.
    const solid = (p: OcrPass): boolean =>
      p.confidence >= confidentEnough && (p.text.match(/\d+/g) ?? []).length >= 12;
    if (prepared) {
      const a = await run('enhanced', prepared.enhanced, '6');
      const b = await run('binarized', prepared.binarized, '4');
      if (solid(a) && solid(b)) return passes;
      // Not PSM 3 (auto): on a results table it splits names and values
      // into separate columns, so nothing can be paired — it reads well and
      // extracts nothing.
      await run('binarized', prepared.binarized, '6');
      await run('enhanced', prepared.enhanced, '4');
    }
    // The untouched image is the fallback when preprocessing failed, and
    // one more opinion when the cleaned variants were still low-confidence.
    await run('original', input, '6');
    // Strong deblur last, and only as a fallback (see OcrPass.fallback): on a
    // badly out-of-focus photo it recovers rows nothing else could read, but
    // on a merely soft one it invents confident wrong digits.
    if (prepared && !(solid(passes[0]) || solid(passes[1]))) {
      const d6 = await run('deblurred', prepared.deblurred, '6');
      const d4 = await run('deblurred', prepared.deblurred, '4');
      d6.fallback = d4.fallback = true;
    }
    return passes;
  } finally {
    await worker.terminate().catch(() => {});
  }
};
