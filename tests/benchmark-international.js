const fs = require('fs');
const path = require('path');
const { parseReceiptImage } = require('../lib/gemini');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
const apiKey = process.env.GEMINI_API_KEY || '';

const benchmarks = [
  {
    name: '5. London Pub (£ GBP UK Receipt)',
    path: path.join(__dirname, 'fixtures', 'benchmark', 'london_pub.png'),
    mime: 'image/png',
    currencySymbol: '£',
  },
  {
    name: '6. Paris Bistro (€ EUR French Receipt)',
    path: path.join(__dirname, 'fixtures', 'benchmark', 'paris_bistro.png'),
    mime: 'image/png',
    currencySymbol: '€',
  },
  {
    name: '7. Moon Sushi Bar (Bilingual Hebrew-Japanese TLV Receipt)',
    path: path.join(__dirname, 'fixtures', 'benchmark', 'tel_aviv_sushi.png'),
    mime: 'image/png',
    currencySymbol: '₪',
  },
];

async function run() {
  console.log('================================================================');
  console.log('🌍 RUNNING INTERNATIONAL OCR BENCHMARK (GBP, EUR, BILINGUAL)');
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
        console.log(`     ${idx + 1}. ${item.name} -> ${b.currencySymbol}${item.price} (${item.category})`);
      });
    } else {
      console.log(`❌ Failed:`, res);
    }
    console.log('\n----------------------------------------------------------------\n');
    await new Promise(r => setTimeout(r, 4000));
  }
}

run();
