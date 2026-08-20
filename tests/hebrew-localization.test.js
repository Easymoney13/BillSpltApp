const test = require('node:test');
const assert = require('node:assert');
const { translations } = require('../lib/i18n.js');

test('Hebrew Localization & Comprehension Test Agent: 100% English keys translated to Hebrew', () => {
  const enKeys = Object.keys(translations.en);
  const missingInHebrew = enKeys.filter((key) => !translations.he[key]);
  assert.strictEqual(
    missingInHebrew.length,
    0,
    `Missing Hebrew translations for keys: ${missingInHebrew.join(', ')}`
  );
});

test('Hebrew Localization & Comprehension Test Agent: non-empty meaningful strings for all keys', () => {
  const enKeys = Object.keys(translations.en);
  enKeys.forEach((key) => {
    const heVal = translations.he[key];
    assert(typeof heVal === 'string' && heVal.trim().length > 0, `Key "${key}" has empty Hebrew translation`);
  });
});

test('Hebrew Localization & Comprehension Test Agent: core labels contain actual Hebrew characters', () => {
  const hebrewRegex = /[\u0590-\u05FF]/;
  const coreKeys = [
    'welcomeBack', 'splitBillSubtitle', 'startSplitCard', 'letTryItNow',
    'joinSessionViaCode', 'createAGroupCard', 'yourActiveGroupsHeader',
    'tabSessions', 'tabHistory', 'tabSettings', 'totalExpenses', 'recentBills',
    'personalInfoSection', 'preferencesSection', 'saveSettingsBtn',
    'roomMembersTitle', 'receiptItemsTitle', 'finalSettlementTitle',
    'shareRoomTitle', 'scanCameraOption', 'manualSplitOption'
  ];

  coreKeys.forEach((key) => {
    const heVal = translations.he[key];
    assert(heVal, `Key "${key}" is missing in Hebrew`);
    assert(
      hebrewRegex.test(heVal),
      `Key "${key}" in Hebrew ("${heVal}") does not contain any Hebrew characters!`
    );
  });
});

test('Hebrew Localization & Comprehension Test Agent: dynamic parameter interpolation in Hebrew', () => {
  const testCases = [
    { key: 'helloUser', params: { name: 'נועם' }, expected: 'שלום נועם' },
    { key: 'tipAmountLabel', params: { pct: 15 }, expected: 'טיפ (15%)' },
    { key: 'paidByLabel', params: { name: 'יוסי' }, expected: 'שולם ע״י יוסי' },
    { key: 'membersCountLabel', params: { n: 4 }, expected: '4 משתתפים' },
    { key: 'splitsCountLabel', params: { n: 3 }, expected: '3 חלוקות' },
  ];

  testCases.forEach(({ key, params, expected }) => {
    let str = translations.he[key];
    assert(str, `Key ${key} missing in translations.he`);
    Object.keys(params).forEach((paramKey) => {
      str = str.replace(`{${paramKey}}`, String(params[paramKey]));
    });
    assert.strictEqual(str, expected, `Interpolation failed for key "${key}"`);
  });
});

test('Hebrew Localization & Comprehension Test Agent: consistent banking & payments terminology (Bit, Paybox, NIS ₪)', () => {
  assert(translations.he.payWithBitBtn.includes('Bit') || translations.he.payWithBitBtn.includes('ביט'));
  assert(translations.he.payWithPayboxBtn.includes('Paybox') || translations.he.payWithPayboxBtn.includes('פייבוקס'));
});
