// Extracts medicine entries from raw OCR text of a prescription

const MEDICINE_INDICATORS = [
  /\b(tab|tablet|cap|capsule|inj|injection|syr|syrup|susp|suspension|oint|ointment|cream|gel|drop|spray|patch|powder|lotion|inhaler)\b/i,
  /\b\d+\.?\d*\s*(mg|ml|mcg|g|iu|units?)\b/i,
  /\b(twice|thrice|bd|tds|qid|od|hs|sos|prn|stat)\b/i,
  /^[Rr]\s*[\/x]\s/,
  /^Rx\.?\s/i,
];

const DOSAGE_RE    = /(\d+\.?\d*\s*(?:mg|ml|mcg|g|iu|units?))/gi;
const FREQUENCY_RE = /\b(once\s+daily|twice\s+daily|thrice\s+daily|bd|tds|qid|od|hs|sos|prn|stat|\d+\s*times?\s*(?:a\s+|per\s+)?day)\b/gi;
const DURATION_RE  = /\b(\d+\s*(?:days?|weeks?|months?))\b/gi;

function extractMedicines(rawText) {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 3 && l.length < 300);

  const results = [];

  for (const line of lines) {
    const likely = MEDICINE_INDICATORS.some(p => p.test(line));
    if (!likely) continue;

    const dosages    = [...line.matchAll(DOSAGE_RE)]   .map(m => m[0]).join(', ');
    const freqs      = [...line.matchAll(FREQUENCY_RE)].map(m => m[0]).join(', ');
    const durations  = [...line.matchAll(DURATION_RE)] .map(m => m[0]).join(', ');

    let name = line
      .replace(/^\d+[\.\)\-]\s*/, '')
      .replace(/^[Rr]\s*[\/x]\s*/i, '')
      .replace(/^Rx\.?\s*/i, '')
      .replace(DOSAGE_RE, '')
      .replace(FREQUENCY_RE, '')
      .replace(DURATION_RE, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/[,;:\.\-]+$/, '')
      .trim();

    if (name.length < 2 || name.length > 150) continue;

    results.push({
      medicine_name: name,
      dosage:        dosages    || null,
      frequency:     freqs      || null,
      duration:      durations  || null,
      notes:         null,
      source:        'ocr',
    });
  }

  // Remove near-duplicates
  const seen = new Set();
  return results.filter(m => {
    const key = m.medicine_name.toLowerCase().slice(0, 20);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { extractMedicines };
