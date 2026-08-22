const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseReceiptImage, parseReceiptTextWithGemini } = require('../lib/gemini');

test('Hebrew OCR Benchmark: Porter & Sons real-world receipt parsing', async () => {
  const imgPath = path.join(__dirname, '..', '.user_uploaded', 'media_1787414292519.jpg');
  if (!fs.existsSync(imgPath)) return;
  const base64 = fs.readFileSync(imgPath).toString('base64');
  const result = await parseReceiptImage(base64, 'image/jpeg');

  assert.ok(result, 'OCR result should not be null');
  assert.ok(result.items.length >= 7, `Expected at least 7 items, found ${result.items.length}`);
  
  // Verify key items and prices
  const itemNames = result.items.map(i => i.name);
  assert.ok(itemNames.some(n => n.includes('פרימטור')), 'Should contain Primator Weizen');
  assert.ok(itemNames.some(n => n.includes('ברנרדוס')), 'Should contain St. Bernardus');
  assert.ok(itemNames.some(n => n.includes('המבורגר')), 'Should contain Burger');
  assert.ok(itemNames.some(n => n.includes('פינאלה')), 'Should contain Finale dessert');

  // Verify header metadata is excluded
  assert.ok(!itemNames.some(n => n.includes('514353788')), 'Should not contain tax ID');
  assert.ok(!itemNames.some(n => n.includes('הארבעה')), 'Should not contain address');
  assert.ok(!itemNames.some(n => n.includes('6244355')), 'Should not contain phone number');
});

test('Hebrew OCR Benchmark: Standard cafe raw text parser with discounts and combo items', async () => {
  const rawText = `
קפה ארומה סניף דיזנגוף
ע.מ. 558129031
23/08/2026 13:45

1 קפוצ'ינו גדול          16.00
1 כריך חלומי             38.00
2 קרואסון שוקולד        28.00
1 מיץ תפוזים סחוט       18.00
הנחת חבר מועדון        -10.00
-----------------------------
סה"כ לתשלום             90.00
כולל מע"מ 17%
תודה שקניתם אצלנו!
`;

  const result = await parseReceiptTextWithGemini(rawText);
  if (!result) return; // If API key not present in test env

  assert.equal(result.currency, 'NIS');
  assert.ok(result.items.length >= 4, 'Should extract all 4 purchased items');
  const names = result.items.map(i => i.name);
  assert.ok(names.some(n => n.includes('קפוצ\'ינו')), 'Should extract cappuccino');
  assert.ok(names.some(n => n.includes('חלומי')), 'Should extract halumi sandwich');
  assert.ok(names.some(n => n.includes('קרואסון')), 'Should extract croissant');
  assert.ok(names.some(n => n.includes('תפוזים')), 'Should extract orange juice');
});
