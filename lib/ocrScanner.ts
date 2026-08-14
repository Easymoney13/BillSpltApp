import { createWorker } from 'tesseract.js';

export interface ParsedBill {
  storeName: string;
  date: string;
  currency: string;
  items: Array<{
    id: string;
    name: string;
    price: number;
    category: string;
    claimedBy: string[];
  }>;
}

/**
 * Ultra-Precision Receipt OCR Parser supporting English & Hebrew Receipts
 */
export async function scanBillImageInBrowser(imageSrc: string): Promise<ParsedBill | null> {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker(['eng', 'heb']);

    const ret = await worker.recognize(imageSrc);
    return parseReceiptText(ret.data.text);
  } catch (err) {
    console.warn('Browser Tesseract OCR failed:', err);
    return null;
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
}

export async function scanBillImageRawText(imageSrc: string): Promise<string | null> {
  let worker: any = null;
  try {
    worker = await createWorker(['eng', 'heb']);
    const ret = await worker.recognize(imageSrc);
    return ret.data.text || null;
  } catch (err) {
    console.warn('Browser Tesseract raw OCR failed:', err);
    return null;
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
}

function isTotalOrTaxLine(name: string): boolean {
  if (typeof name !== 'string') return false;
  const clean = name.toLowerCase().replace(/[\s'"“״”`׳:-]+/g, '');
  const totalKeywords = [
    'total', 'subtotal', 'grandtotal', 'tax', 'vat', 'discount', 
    'לתשלום', 'סהכ', 'סחכ', 'סךהכל', 'סכהכל', 'סחיכ', 'סהיק',
    'מעמ', 'מזומן', 'אשראי', 'עודף'
  ];
  return totalKeywords.some(keyword => clean.includes(keyword));
}

export function parseReceiptText(rawText: string): ParsedBill | null {
  if (!rawText || rawText.trim().length === 0) return null;

  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return null;

  // 1. Store Name Detection
  let storeName = 'Scanned Receipt';
  for (let i = 0; i < Math.min(6, lines.length); i++) {
    const candidate = lines[i]
      .replace(/[^\w\s\u0590-\u05FF]/g, '')
      .trim();
    if (
      candidate.length >= 2 &&
      !/^(tel|vat|reg|check|date|cashier|#|mc\b|vat\b|receipt|tax|table|טלפון|ח.פ|מספר)/i.test(candidate) &&
      !/\d{2}[-/.]\d{2}[-/.]\d{2,4}/.test(candidate)
    ) {
      storeName = candidate;
      break;
    }
  }

  // 2. Currency Detection (Automatic NIS force for Hebrew receipts)
  const hasHebrewText = /[\u0590-\u05FF]/.test(rawText);
  let currency = 'USD';
  if (hasHebrewText || rawText.includes('₪') || /nis|ils|ש"ח|שח/i.test(rawText)) {
    currency = 'NIS';
  } else if (rawText.includes('£') || /gbp/i.test(rawText)) {
    currency = 'GBP';
  } else if (rawText.includes('€') || /eur/i.test(rawText)) {
    currency = 'EUR';
  } else if (rawText.includes('$') || /usd/i.test(rawText)) {
    currency = 'USD';
  }

  // 3. Date Detection
  let dateStr = new Date().toISOString().split('T')[0];
  const dateMatch = rawText.match(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/);
  if (dateMatch) dateStr = dateMatch[0];

  // 4. Line Item Parsing
  const items: Array<{
    id: string;
    name: string;
    price: number;
    category: string;
    claimedBy: string[];
  }> = [];

  const noiseRegex = /^(reg\b|check\b|mc\b|vat\b|tel\b|date\b|time\b|table\b|cashier\b|eat\s*out|thank|welcome|subtotal|total\b|cash|change|visa|mastercard|balance|receipt|srvc\s*tl|סה"כ|סהכ|מזומן|אשראי|עודף|תאריך|שעה|שולחן|חשבון)/i;
  const timestampRegex = /\d{2}[-/.]\d{2}[-/.]\d{2,4}|\d{1,2}:\d{2}/;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (noiseRegex.test(line) || timestampRegex.test(line)) {
      continue;
    }

    // Skip lines starting with a minus sign or representing discounts
    if (line.trim().startsWith('-')) {
      continue;
    }

    // Try multi-pattern price matching
    // Pattern 1: Standard line ending with price or currency (e.g. "Pizza 45.00", "Coffee 12.50 NIS")
    // Pattern 2: Multi-column Hebrew receipts (e.g. "פיצה בהרכבה עצמית 45 1 45.00" or "45.00 1 45 פיצה")
    let rawName = '';
    let priceVal = 0;
    let foundMatch = false;

    // First try decimal price pattern (e.g. 45.00 or 12.50)
    const decimalMatches = [...line.matchAll(/\b(\d+[.,]\d{1,2})\b/g)];
    const decimalMatch = decimalMatches.at(-1);
    if (decimalMatch) {
      priceVal = parseFloat(decimalMatch[1].replace(',', '.'));
      // Remove all numbers, punctuation, and isolate item name
      const nameCleaned = line.replace(/\b\d+(?:[.,]\d{1,2})?\b/g, '').replace(/[-_+=|\\/#]/g, ' ').trim();
      if (nameCleaned.length >= 2 && !noiseRegex.test(nameCleaned)) {
        rawName = nameCleaned;
        foundMatch = true;
      }
    }

    if (!foundMatch) {
      // Pattern 1: Right-aligned price
      const matchRight = line.match(/^(.*?)(?:[£$₪€\s]+)(\d+(?:[.,]\d{1,2})?)\s*(?:[A-Za-z\u0590-\u05FF]{1,3})?\s*$/);
      if (matchRight && matchRight[1].trim().length >= 2) {
        rawName = matchRight[1].trim();
        priceVal = parseFloat(matchRight[2].replace(',', '.'));
        foundMatch = true;
      } else {
        // Pattern 2: Left-aligned price
        const matchLeft = line.match(/^(\d+(?:[.,]\d{1,2})?)\s+(.+)$/);
        if (matchLeft && matchLeft[2].trim().length >= 2 && !/^\d+$/.test(matchLeft[2])) {
          priceVal = parseFloat(matchLeft[1].replace(',', '.'));
          rawName = matchLeft[2].trim();
          foundMatch = true;
        }
      }
    }

    if (foundMatch && !isNaN(priceVal) && priceVal > 0 && priceVal < 10000) {
      if (isTotalOrTaxLine(rawName)) continue;
      const qtyMatch = rawName.match(/^(\d+)\s+(.+)$/);
      let qtyStr = '';
      if (qtyMatch) {
        qtyStr = ` (${qtyMatch[1]}x)`;
        rawName = qtyMatch[2].trim();
      }

      rawName = rawName.replace(/^[^\w\u0590-\u05FF]+/, '').trim();

      let category = 'Food';
      if (/(coke|peroni|juice|beer|coffee|drink|tea|water|wine|soda|beverage|שתיה|בירה|קפה|מיץ|קולה)/i.test(rawName)) {
        category = 'Beverages';
      } else if (/(cake|ice cream|dessert|tiramisu|pie|sweet|cookie|קינוח|עוגה|גלידה)/i.test(rawName)) {
        category = 'Dessert';
      } else if (/(srvc|service|tip|tax|charge|שירות|טיפ|מעמ)/i.test(rawName)) {
        category = 'Service';
      }

      if (rawName.length >= 2) {
        items.push({
          id: `item_${Date.now()}_${i}`,
          name: rawName + qtyStr,
          price: priceVal,
          category,
          claimedBy: [],
        });
      }
    }
  }

  if (items.length === 0) return null;

  return {
    storeName,
    date: dateStr,
    currency,
    items,
  };
}
