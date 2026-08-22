const fs = require('fs');
const path = require('path');
const { parseReceiptImage } = require('../lib/gemini');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
const apiKey = process.env.GEMINI_API_KEY || '';

const userUploadedDir = 'C:\\\\Users\\\\naorw\\\\.gemini\\\\antigravity-ide\\\\brain\\\\9f755d6f-36b6-4b64-97fc-3055b7fe6f95\\\\.user_uploaded';

const benchmarkFiles = [
  {
    name: 'Porter & Sons (Real Hebrew Camera Photo)',
    path: path.join(userUploadedDir, 'media_1787414292519.jpg'),
    mime: 'image/jpeg',
    expectedCurrency: 'NIS',
    minItems: 8,
    sampleCheck: (items) => items.some(i => i.name.includes('המבורגר') || i.name.includes('פרימטור')),
  },
  {
    name: 'Aroma Cafe (Hebrew Cafe Receipt)',
    path: path.join(__dirname, 'fixtures', 'benchmark', 'aroma_cafe_hebrew.png'),
    mime: 'image/png',
    expectedCurrency: 'NIS',
    minItems: 5,
    sampleCheck: (items) => items.some(i => i.name.includes('קפוצינו') || i.name.includes('חלומי')),
  },
  {
    name: 'Rami Levy (Hebrew Supermarket Receipt)',
    path: path.join(__dirname, 'fixtures', 'benchmark', 'supermarket_rami_levy.png'),
    mime: 'image/png',
    expectedCurrency: 'NIS',
    minItems: 7,
    sampleCheck: (items) => items.some(i => i.name.includes('תנובה') || i.name.includes('עמק')),
  },
  {
    name: 'Moon Sushi Bar (Bilingual TLV Receipt)',
    path: path.join(__dirname, 'fixtures', 'benchmark', 'tel_aviv_sushi.png'),
    mime: 'image/png',
    expectedCurrency: 'NIS',
    minItems: 6,
    sampleCheck: (items) => items.some(i => i.name.includes('Sushi') || i.name.includes('Salmon') || i.name.includes('Roll')),
  },
  {
    name: 'NYC Steakhouse ($ USD US Receipt)',
    path: path.join(__dirname, 'fixtures', 'benchmark', 'nyc_steakhouse.png'),
    mime: 'image/png',
    expectedCurrency: 'USD',
    minItems: 6,
    sampleCheck: (items) => items.some(i => i.name.includes('Ribeye') || i.name.includes('Filet')),
  },
  {
    name: 'London Pub (£ GBP UK Receipt)',
    path: path.join(__dirname, 'fixtures', 'benchmark', 'london_pub.png'),
    mime: 'image/png',
    expectedCurrency: 'GBP',
    minItems: 5,
    sampleCheck: (items) => items.some(i => i.name.includes('Fish') || i.name.includes('Chips') || i.name.includes('Ale')),
  },
  {
    name: 'Paris Bistro (€ EUR French Receipt)',
    path: path.join(__dirname, 'fixtures', 'benchmark', 'paris_bistro.png'),
    mime: 'image/png',
    expectedCurrency: 'EUR',
    minItems: 5,
    sampleCheck: (items) => items.some(i => i.name.includes('Canard') || i.name.includes('Entrecote')),
  },
];

async function runBenchmark() {
  console.log('===============================================================');
  console.log('🚀 RUNNING COMPREHENSIVE HEBREW & ENGLISH OCR BENCHMARK (Gemini 3.6 Flash)');
  console.log('===============================================================\n');

  let passed = 0;
  let total = benchmarkFiles.length;

  for (const b of benchmarkFiles) {
    if (!fs.existsSync(b.path)) {
      console.log(`⚠️ Skipped ${b.name}: file not found at ${b.path}`);
      continue;
    }

    // Rate-limit throttle between requests
    await new Promise((r) => setTimeout(r, 2500));

    const base64 = fs.readFileSync(b.path).toString('base64');
    const start = Date.now();
    try {
      const result = await parseReceiptImage(base64, b.mime);
      const elapsed = Date.now() - start;

      if (!result || !result.items || result.items.length === 0) {
        console.error(`❌ [FAIL] ${b.name}: Result was null or empty (${elapsed}ms)`);
        continue;
      }

      const currencyOk = result.currency === b.expectedCurrency;
      const countOk = result.items.length >= b.minItems;
      const sampleOk = b.sampleCheck(result.items);

      if (currencyOk && countOk && sampleOk) {
        passed += 1;
        console.log(`✅ [PASS] ${b.name} (${elapsed}ms)`);
        console.log(`   Store: "${result.storeName}" | Currency: ${result.currency} | Items: ${result.items.length}`);
        result.items.forEach((item, idx) => {
          const sym = result.currency === 'USD' ? '$' : result.currency === 'GBP' ? '£' : result.currency === 'EUR' ? '€' : '₪';
          console.log(`     ${idx + 1}. ${item.name} -> ${sym}${item.price} [${item.category}]`);
        });
      } else {
        console.error(`❌ [FAIL] ${b.name}: Currency=${result.currency} (expected ${b.expectedCurrency}), Items=${result.items.length} (min ${b.minItems})`);
      }
      console.log('');
    } catch (err) {
      console.error(`❌ [ERROR] ${b.name}:`, err.message);
    }
  }

  console.log('===============================================================');
  console.log(`🎯 BENCHMARK SUMMARY: ${passed}/${total} PASSED (${Math.round((passed/total)*100)}% Accuracy)`);
  console.log('===============================================================');
}

runBenchmark();
