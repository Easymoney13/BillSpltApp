function collectWords(blocks) {
  const words = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    for (const paragraph of block?.paragraphs || []) {
      for (const line of paragraph?.lines || []) {
        for (const word of line?.words || []) {
          const text = String(word?.text || '').trim();
          const bbox = word?.bbox;
          if (!text || !bbox || !Number.isFinite(bbox.x0) || !Number.isFinite(bbox.y0)) continue;
          words.push({
            text,
            x0: Number(bbox.x0),
            x1: Number(bbox.x1),
            y0: Number(bbox.y0),
            y1: Number(bbox.y1),
            confidence: Number(word.confidence) || 0,
          });
        }
      }
    }
  }
  return words;
}

/**
 * Tesseract's sparse-text mode often emits the price and the RTL item name as
 * separate text lines. Rebuild physical receipt rows from word coordinates,
 * then place Hebrew words in logical reading order before the text parser.
 */
function mergeNumericWords(primaryWords, numericBlocks) {
  const numericWords = collectWords(numericBlocks).filter((word) => /^\d{1,6}(?:[.,]\d{1,2})?$/.test(word.text));
  if (!numericWords.length) return primaryWords;
  return primaryWords.map((word) => {
    if (!/\d/.test(word.text)) return word;
    const centerX = (word.x0 + word.x1) / 2;
    const centerY = (word.y0 + word.y1) / 2;
    const closest = numericWords
      .map((candidate) => ({
        candidate,
        distanceX: Math.abs(centerX - ((candidate.x0 + candidate.x1) / 2)),
        distanceY: Math.abs(centerY - ((candidate.y0 + candidate.y1) / 2)),
      }))
      .filter(({ candidate, distanceX, distanceY }) => (
        distanceY <= Math.max(12, (word.y1 - word.y0) * 0.8)
        && distanceX <= Math.max(24, word.x1 - word.x0, candidate.x1 - candidate.x0)
      ))
      .sort((a, b) => (a.distanceY + a.distanceX * 0.25) - (b.distanceY + b.distanceX * 0.25))[0]?.candidate;
    return closest ? { ...word, text: closest.text, confidence: closest.confidence } : word;
  });
}

function reconstructReceiptRows(blocks, numericBlocks = null) {
  const words = mergeNumericWords(collectWords(blocks), numericBlocks);
  if (!words.length) return '';
  const heights = words.map((word) => Math.max(1, word.y1 - word.y0)).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 24;
  const centerTolerance = Math.max(8, medianHeight * 0.72);
  const rows = [];

  for (const word of words.sort((a, b) => ((a.y0 + a.y1) / 2) - ((b.y0 + b.y1) / 2))) {
    const center = (word.y0 + word.y1) / 2;
    let bestRow = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      const distance = Math.abs(center - row.center);
      const verticalOverlap = Math.max(0, Math.min(word.y1, row.y1) - Math.max(word.y0, row.y0));
      const minimumHeight = Math.min(word.y1 - word.y0, row.y1 - row.y0);
      if ((distance <= centerTolerance || verticalOverlap >= minimumHeight * 0.35) && distance < bestDistance) {
        bestRow = row;
        bestDistance = distance;
      }
    }
    if (!bestRow) {
      rows.push({ center, y0: word.y0, y1: word.y1, words: [word] });
      continue;
    }
    bestRow.words.push(word);
    bestRow.y0 = Math.min(bestRow.y0, word.y0);
    bestRow.y1 = Math.max(bestRow.y1, word.y1);
    bestRow.center = bestRow.words.reduce((sum, item) => sum + (item.y0 + item.y1) / 2, 0) / bestRow.words.length;
  }

  return rows
    .sort((a, b) => a.center - b.center)
    .map((row) => {
      const hasHebrew = row.words.some((word) => /[\u0590-\u05ff]/.test(word.text));
      return row.words
        .sort((a, b) => hasHebrew ? b.x0 - a.x0 : a.x0 - b.x0)
        .map((word) => word.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    })
    .filter(Boolean)
    .join('\n');
}

module.exports = { collectWords, mergeNumericWords, reconstructReceiptRows };
