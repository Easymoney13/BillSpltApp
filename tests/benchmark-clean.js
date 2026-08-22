const fs = require('fs');
const path = require('path');
const { parseReceiptImage } = require('../lib/gemini');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
const apiKey = process.env.GEMINI_API_KEY || '';

const userUploadedDir = 'C:\\\\Users\\\\naorw\\\\.gemini\\\\antigravity-ide\\\\brain\\\\9f755d6f-36b6-4b64-97fc-3055b7fe6f95\\\\.user_uploaded';

const benchmarks = [
  {
    name: '1. Porter & Sons (Real Hebrew Photo)',
    path: path.join(userUploadedDir, 'media_1787414292519.jpg'),
    mime: 'image/jpeg',
    expectedCurrency: 'NIS',
  },
  {
    name: '2. Aroma Cafe (Hebrew Cafe Receipt)',
    path: path.join(__dirname, 'fixtures', 'benchmark', 'aroma_cafe_hebrew.png'),
    mime: 'image/png',
    expectedCurrency: 'NIS',
  },
  {
    name: '3. Rami Levy (Hebrew Supermarket Receipt)',
    path: path.join(__dirname, 'fixtures', 'benchmark', 'supermarket_rami_levy.png'),
    mime: 'image/png',
    expectedCurrency: 'NIS',
  },
  {
    name: '4. NYC Steakhouse (US $ USD Receipt)',
    path: path.join(__dirname, 'fixtures', 'benchmark', 'nyc_steakhouse.png'),
    mime: 'image/png',
    expectedCurrency: 'USD',
  },
];

async function run() {
  console.log('================================================================');
  console.log('📊 ACCURACY BENCHMARK ON HEBREW & INTERNATIONAL RECEIPTS');
  console.log('================================================================\n');

  for (const b of benchmarks) {
    if (!fs.existsSync(b.path)) continue;
    console.log(`Testing ${b.name}...`);
    const base64 = fs.readFileSync(b.path).toString('base64');
    const start = Date.now();
    const res = await parseReceiptImage(base64, b.mime);
    const ms = Date.now() - start;

    if (res && res.items && res.items.length) {
      console.log(`✅ [SUCCESS in ${ms}ms] Store: "${res.storeName}" | Currency: ${res.currency}`);
      console.log(`   Items extracted (${res.items.length}):`);
      res.items.forEach((item, idx) => {
        const sym = res.currency === 'USD' ? '$' : '₪';
        console.log(`     ${idx + 1}. ${item.name} -> ${sym}${item.price} (${item.category})`);
      });
    } else {
      console.log(`❌ Failed:`, res);
    }
    console.log('\n----------------------------------------------------------------\n');
    // Respect rate limit window
    await new Promise(r => setTimeout(r, 6000));
  }
}

run();
