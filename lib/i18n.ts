export const translations: Record<string, Record<string, string>> = {
  en: {
    appName: "BillSplit",
    tagline: "Split bills instantly in real-time with friends",
    welcomeBack: "Welcome back",
    
    // Tabs
    tabSessions: "Sessions",
    tabHistory: "History",
    tabSettings: "Settings",
    
    // Sessions Home
    activeSplitTitle: "Active Split",
    reenterActiveSession: "Re-Enter Active Session",
    removeBtn: "Remove",
    realTimeOcrBadge: "Real-Time OCR Split",
    startNewSplit: "Start a New Split",
    startSplitSub: "Scan receipt with camera or upload a photo from your gallery to split costs instantly.",
    uploadPhoto: "Upload Photo",
    parsing: "Parsing OCR...",
    scanCamera: "Scan Camera",
    manualBtn: "Manual",
    joinViaCode: "Join via 4-Digit Code",
    enterCodePlaceholder: "Enter 4-digit code (e.g. 8492)",
    joinSessionBtn: "Join Session",
    startSplitBtn: "Start Split",
    joinSessionBtnAction: "Join Session",
    sessionIdLabel: "Session ID",
    codeLabel: "Group Code",

    // Start Split Options
    startSplitTitle: "Start a New Split",
    startSplitSubtitle: "Choose how you want to load the bill",
    scanCameraOption: "Scan Receipt Camera",
    scanCameraDesc: "Snap a photo of the bill instantly",
    uploadPhotoOption: "Upload Image from Gallery",
    uploadPhotoDesc: "Select a receipt screenshot or photo",
    manualSplitOption: "Create Bill Manually",
    manualSplitDesc: "Type in the items and prices yourself",

    // Create Group Modal
    createGroupTitle: "Create Trip / Expense Group",
    createGroupSub: "Share bills with friends & minimize debts",
    groupNameLabel: "Group Name",
    groupNamePlaceholder: "e.g. Eilat Trip 🌴 or Roommates",

    // Groups Section
    yourActiveGroups: "Your Active Groups ({n})",
    groupsTitle: "Groups",
    createGroupBtn: "Create Group",
    groupsSub: "Create a group to split shared bills and minimize debts with friends.",
    noGroupsYetHint: "💡 Create a group above to start a shared expense tracker with friends!",
    joinGroupBtn: "Join Group",
    enterGroupCodePlaceholder: "Enter Group Code (e.g. 8492)",
    tripExpenseTracker: "Group Expense Tracker",
    addBillsToGroup: "Add Bills to {groupName}",
    groupHeroSub: "Upload scans or manual bills anytime. Balances update & minimize automatically!",
    debtMinimizationTitle: "Debt Minimization Settlement",
    minimizedPaymentsCount: "{n} MINIMIZED PAYMENT(S)",
    memberNetBalances: "MEMBER NET BALANCES",
    allExpensesSettled: "All group expenses are settled! No debts owed. 🎉",
    groupPastBills: "Group Past Bills ({n})",
    tapPastBillNotice: "Tap past bill to claim items",
    noBillsYetGroup: "No bills added to this group yet. Use the buttons above to scan or create a bill!",
    paidByLabel: "Paid by {name}",
    liveSessionBtn: "Live Session",
    splitAllEqually: "Split All Equally",
    tapMemberChipNotice: "Tap member chip on an item to claim item share:",
    attachBillTitle: "Attach Bill to Group",
    attachBillSub: "Add this bill to a trip or roommate group",
    selectGroupLabel: "Select Your Group",
    enterGroupCodeLabel: "Enter 4-Digit Group Code",
    attachBtn: "Attach Bill 🔗",

    // History Tab
    pastHistoryTitle: "Past Splits History",
    recentBills: "Recent bills",
    noHistoryYet: "No settled splits yet. Completed splits will appear here.",
    deleteBtn: "Delete",
    storeLabel: "Store",
    dateLabel: "Date",
    totalLabel: "Total",
    membersCountLabel: "{n} members",

    // Settings Tab
    settingsTitle: "Account Settings",
    personalInfoSection: "Personal Info",
    displayNameLabel: "Display Name",
    phoneNumberLabel: "Phone Number",
    phoneInputPlaceholder: "050-1234567",
    phoneLabel: "Phone Number (for Bit/Paybox transfers)",
    phoneHint: "Required to receive payments from group members",
    preferencesSection: "Preferences",
    preferredCurrencyLabel: "Preferred Currency",
    languageSectionLabel: "Language / שפה",
    themeModeLabel: "App Theme Mode",
    lightModeBtn: "Light Mode",
    darkModeBtn: "Dark Mode",
    hebrewLangBtn: "עברית (Hebrew)",
    englishLangBtn: "English",
    saveSettingsBtn: "Save Settings",
    settingsSavedMsg: "Settings Saved!",
    profilePhotoLabel: "Profile Picture",
    changePhotoBtn: "Change",
    removePhotoBtn: "Remove",
    nameInputPlaceholder: "e.g. Naor",

    // Workspace & Session Screen
    roomMembersTitle: "Room Members",
    inviteBtn: "Invite",
    receiptItemsTitle: "Receipt Items",
    tapItemToClaim: "Tap item to claim & split cost",
    splitAllBtn: "Split All",
    availableLabel: "Available",
    yourShareLabel: "Your Share",
    settleAndPayBtn: "Settle & Pay",
    youSuffix: "(You)",
    hostBadge: "HOST",

    // Modals
    welcomeTitle: "Welcome to BillSplit",
    enterNameSub: "Enter your display name to join the room:",
    namePlaceholder: "e.g. Sarah",
    joinRoomBtn: "Join Room",
    
    hostPhoneTitle: "Host Phone Number",
    hostPhoneSub: "Enter phone number for instant Bit/Paybox transfers:",
    savePhoneBtn: "Save Phone Number",

    addCustomItemTitle: "Add Custom Item",
    itemNameLabel: "Item Name",
    priceLabel: "Price",
    categoryLabel: "Category",
    cancelBtn: "Cancel",
    addItemBtn: "Add Item",

    // Settle Modal
    finalSettlementTitle: "Final Settlement",
    selectTipLabel: "Select Tip Percentage",
    itemsSubtotalLabel: "Items Subtotal",
    tipAmountLabel: "Tip ({pct}%)",
    yourTotalDueLabel: "Your Total Due",
    payHostTitle: "Pay Room Host ({hostName})",
    payWithBitBtn: "Pay with Bit 📲",
    payWithPayboxBtn: "Pay with Paybox 📦",
    markAsSettledBtn: "Mark as Settled ✨",
    settledBadge: "Settled ✓",
    archiveSessionBtn: "Close & Archive Session to History",
    settleAndCloseSessionBtn: "Settle Payment & Close Session",

    // QR Code Modal
    scanToJoinTitle: "Scan to Join Room",
    friendsScanSub: "Friends scan with their camera to join",
    fourDigitSessionCodeLabel: "4-Digit Session Code",
    copyLinkBtn: "Copy Link",
    copiedLinkMsg: "Copied Link!",
    shareLinkBtn: "Share Link",

    // Scanner & Manual Entry
    receiptScannerTitle: "Camera Receipt OCR",
    presetPrompt: "Position bill within frame & tap shutter to scan",
    createBillManually: "Create Bill Manually",
    manualEntryTitle: "Create Custom Split Bill",
    manualEntrySub: "Enter bill title, choose currency, and add items manually.",
    billTitleLabel: "Bill / Venue Title",
    billTitlePlaceholder: "e.g. Sushi Dinner with Friends",
    quickPresetsLabel: "Quick Preset Items",
    createAndStartSessionBtn: "Create & Launch Session ✨",
    editItemTitle: "Edit Receipt Item",
    updateItemBtn: "Update Item",
    deleteItemBtn: "Delete Item",
    customGeminiKeyLabel: "Personal Gemini API Key (Optional)",
    customGeminiKeyHint: "Use your own free Gemini API key to avoid rate limits.",
    ocrEngineLabel: "Default OCR Engine",
    engineTesseract: "⚡ Free Client-Side OCR (Unlimited, 0$)",
    engineGemini: "✨ Gemini AI Vision (Custom API Key)",

    // Categories & Financial Summary
    personalFinancialSummary: "Personal Financial Summary",
    liveBreakdown: "Live Breakdown",
    catDining: "Dining & Drinks",
    catGroceries: "Groceries",
    catTravel: "Travel & Stay",
    catEntertainment: "Entertainment",
    catGeneral: "General & Other",
    catOther: "Other",
    catFood: "Food",
    catBeverages: "Beverages",
    catDessert: "Dessert",
    catService: "Service",
    splitsWord: "splits",
    activeGroupsCountLabel: "{n} Active Groups",
    splitsCountLabel: "{n} Splits",
    totalSpentLabel: "Total Spent",
    billAttachedToGroup: "Bill Attached to Group",
    linkedBadge: "LINKED ✓",
    eachLabel: "each",
    deleteGroupItem: "Delete Group",
    shareGroupItem: "Share Group",
    seeGroupDetails: "See Group Details",
    backToOptions: "Back to Options",
    whoPaidUpfront: "Who paid this bill upfront?",
    confirmLeaveGroup: "Are you sure you want to leave this group?",
    leaveGroup: "Leave Group",

    // Alerts & Messages
    codeNotFound: "Session code not found. Please check the 4-digit code.",
    couldNotParse: "Could not parse receipt image. Please take a clear, well-lit photo or enter items manually.",
    errorUploading: "Error uploading receipt image."
  },

  he: {
    appName: "BillSplit",
    tagline: "חלוקת חשבונות מהירה בזמן אמת עם חברים",
    welcomeBack: "ברוך שובך",
    
    // Tabs
    tabSessions: "סשנים",
    tabHistory: "היסטוריה",
    tabSettings: "הגדרות",
    
    // Sessions Home
    activeSplitTitle: "סשן פעיל",
    reenterActiveSession: "חזור לסשן הפעיל",
    removeBtn: "הסר",
    realTimeOcrBadge: "פיצול חשבונית בזמן אמת",
    startNewSplit: "התחל חלוקה חדשה",
    startSplitSub: "סרוק קבלה במצלמה או העלה תמונה מהגלריה לפענוח פריטים מהיר.",
    uploadPhoto: "העלה תמונה",
    parsing: "מפענח OCR...",
    scanCamera: "סרוק במצלמה",
    manualBtn: "ידנית",
    joinViaCode: "הצטרף באמצעות קוד 4 ספרות",
    enterCodePlaceholder: "הזן קוד 4 ספרות (למשל 8492)",
    joinSessionBtn: "הצטרף לסשן",
    startSplitBtn: "התחל פיצול",
    joinSessionBtnAction: "הצטרף לסשן",
    sessionIdLabel: "מזהה סשן",
    codeLabel: "קוד קבוצה",

    // Start Split Options
    startSplitTitle: "התחל פיצול חדש",
    startSplitSubtitle: "בחר כיצד ברצונך להעלות את החשבונית",
    scanCameraOption: "סרוק קבלה במצלמה",
    scanCameraDesc: "צלם תמונה של הקבלה באופן מיידי",
    uploadPhotoOption: "העלה תמונה מהגלריה",
    uploadPhotoDesc: "בחר צילום מסך או תמונה של קבלה",
    manualSplitOption: "צור חשבונית ידנית",
    manualSplitDesc: "הקלד את הפריטים והמחירים בעצמך",

    // Create Group Modal
    createGroupTitle: "צור קבוצת הוצאות / טיול",
    createGroupSub: "חלק חשבונות עם חברים וצמצום חובות",
    groupNameLabel: "שם הקבוצה",
    groupNamePlaceholder: "למשל טיול לאילת 🌴 או שותפים",

    // Groups Section
    yourActiveGroups: "הקבוצות הפעילות שלך ({n})",
    groupsTitle: "קבוצות",
    createGroupBtn: "צור קבוצה",
    groupsSub: "צור קבוצה לחלוקת חשבונות וצמצום חובות עם חברים.",
    noGroupsYetHint: "💡 צור קבוצה למעלה כדי להתחיל מעקב הוצאות משותף עם חברים!",
    joinGroupBtn: "הצטרף לקבוצה",
    enterGroupCodePlaceholder: "הזן קוד קבוצה (למשל 8492)",
    tripExpenseTracker: "מעקב הוצאות קבוצתי",
    addBillsToGroup: "הוספת חשבונות ל{groupName}",
    groupHeroSub: "סרוק קבלות או הזן חשבונות. היתרות מתעדכנות ומצטמצמות אוטומטית!",
    debtMinimizationTitle: "סיכום וצמצום חובות",
    minimizedPaymentsCount: "{n} תשלומים מצומצמים",
    memberNetBalances: "יתרות נטו של החברים",
    allExpensesSettled: "כל ההוצאות הקבוצתיות סודרו! אין חובות. 🎉",
    groupPastBills: "חשבונות עבר בקבוצה ({n})",
    tapPastBillNotice: "לחץ על חשבון עבר כדי לבחור פריטים",
    noBillsYetGroup: "עדיין לא נוספו חשבונות לקבוצה זו. השתמש בכפתורים למעלה כדי לסרוק או ליצור חשבון!",
    paidByLabel: "שולם ע״י {name}",
    liveSessionBtn: "סשן חי",
    splitAllEqually: "פצל לכולם בשווה",
    tapMemberChipNotice: "לחץ על צ׳יפ של חבר כדי לבחור את חלקו:",
    attachBillTitle: "שייך חשבון לקבוצה",
    attachBillSub: "הוסף חשבון זה לקבוצת טיול או דירה",
    selectGroupLabel: "בחר את הקבוצה שלך",
    enterGroupCodeLabel: "הזן קוד קבוצה בן 4 ספרות",
    attachBtn: "שייך חשבון 🔗",

    // History Tab
    pastHistoryTitle: "היסטוריית חלוקות",
    recentBills: "חשבונות אחרונים",
    noHistoryYet: "אין עדיין חלוקות ששולמו. חלוקות שהסתיימו יופיעו כאן.",
    deleteBtn: "מחק",
    storeLabel: "בית עסק",
    dateLabel: "תאריך",
    totalLabel: "סה״כ",
    membersCountLabel: "{n} משתתפים",

    // Settings Tab
    settingsTitle: "הגדרות חשבון",
    personalInfoSection: "פרטים אישיים",
    displayNameLabel: "שם תצוגה",
    phoneNumberLabel: "מספר טלפון",
    phoneInputPlaceholder: "050-1234567",
    phoneLabel: "מספר טלפון (להעברות ביט/פייבוקס)",
    phoneHint: "נדרש לקבלת תשלומים מחברי הקבוצה",
    preferencesSection: "העדפות",
    preferredCurrencyLabel: "מטבע מועדף",
    languageSectionLabel: "שפה / Language",
    themeModeLabel: "מצב תצוגה",
    lightModeBtn: "מצב יום",
    darkModeBtn: "מצב לילה",
    hebrewLangBtn: "עברית (Hebrew)",
    englishLangBtn: "English",
    saveSettingsBtn: "שמור הגדרות",
    settingsSavedMsg: "ההגדרות נשמרו!",
    profilePhotoLabel: "תמונת פרופיל",
    changePhotoBtn: "שינוי",
    removePhotoBtn: "הסרה",
    nameInputPlaceholder: "למשל: נאור",

    // Workspace & Session Screen
    roomMembersTitle: "חברי החדר",
    inviteBtn: "הזמן",
    receiptItemsTitle: "פריטי החשבונית",
    tapItemToClaim: "לחץ על פריט כדי לבחור ולפצל",
    splitAllBtn: "פצל לכולם",
    availableLabel: "זמין",
    yourShareLabel: "החלק שלך",
    settleAndPayBtn: "לתשלום וסיכום",
    youSuffix: "(אתה)",
    hostBadge: "מארח",

    // Modals
    welcomeTitle: "ברוכים הבאים ל-BillSplit",
    enterNameSub: "הזן שם תצוגה להצטרפות לחדר:",
    namePlaceholder: "למשל: שרה",
    joinRoomBtn: "הצטרף לחדר",
    
    hostPhoneTitle: "מספר טלפון של המארח",
    hostPhoneSub: "הזן מספר טלפון להעברות בביט/פייבוקס:",
    savePhoneBtn: "שמור מספר טלפון",

    addCustomItemTitle: "הוספת פריט ידנית",
    itemNameLabel: "שם הפריט",
    priceLabel: "מחיר",
    categoryLabel: "קטגוריה",
    cancelBtn: "ביטול",
    addItemBtn: "הוסף פריט",

    // Settle Modal
    finalSettlementTitle: "סיכום חשבון ותשלום",
    selectTipLabel: "בחר אחוז טיפ",
    itemsSubtotalLabel: "סכום ביניים",
    tipAmountLabel: "טיפ ({pct}%)",
    yourTotalDueLabel: "הסכום לתשלום שלך",
    payHostTitle: "שלם למארח החדר ({hostName})",
    payWithBitBtn: "שלם ב-Bit 📲",
    payWithPayboxBtn: "שלם ב-Paybox 📦",
    markAsSettledBtn: "סמן כשולם ✨",
    settledBadge: "שולם ✓",
    archiveSessionBtn: "סגור והעבר להסטוריה",
    settleAndCloseSessionBtn: "סגור סשן ותשלום",

    // QR Code Modal
    scanToJoinTitle: "סרוק להצטרפות לחדר",
    friendsScanSub: "חברים סורקים במצלמה להצטרפות",
    fourDigitSessionCodeLabel: "קוד סשן 4 ספרות",
    copyLinkBtn: "העתק קישור",
    copiedLinkMsg: "הקישור הועתק!",
    shareLinkBtn: "שתף קישור",

    // Scanner & Manual Entry
    receiptScannerTitle: "סורק קבלות במצלמה",
    presetPrompt: "יישר את הקבלה בתוך המסגרת ולחץ על הלחצן לסריקה",
    createBillManually: "יצירת חשבונית ידנית",
    manualEntryTitle: "צור חלוקת חשבון ידנית",
    manualEntrySub: "הזן שם מקום, בחר מטבע והוסף פריטים ידנית.",
    billTitleLabel: "שם המקום / החשבון",
    billTitlePlaceholder: "למשל: מסעדת פסטה עם חברים",
    quickPresetsLabel: "פריטים מהירים",
    createAndStartSessionBtn: "צור ופתח סשן ✨",
    editItemTitle: "עריכת פריט בחשבונית",
    updateItemBtn: "עדכן פריט",
    deleteItemBtn: "מחק פריט",
    customGeminiKeyLabel: "מפתח Gemini API אישי (אופציונלי)",
    customGeminiKeyHint: "השתמש במפתח Gemini בחינם שלך כדי להימנע ממגבלות שימוש.",
    ocrEngineLabel: "מנוע פענוח OCR מועדף",
    engineTesseract: "⚡ OCR מקומי בחינם (ללא הגבלה, 0$)",
    engineGemini: "✨ Gemini AI Vision (מפתח אישי)",

    // Categories & Financial Summary
    personalFinancialSummary: "סיכום פיננסי אישי",
    liveBreakdown: "פירוט חי",
    catDining: "מסעדות ושתייה",
    catGroceries: "קניות וסופר",
    catTravel: "נסיעות ולינה",
    catEntertainment: "בילויים ופנאי",
    catGeneral: "כללי ואחר",
    catOther: "אחר",
    catFood: "אוכל",
    catBeverages: "שתייה",
    catDessert: "קינוחים",
    catService: "שירות",
    splitsWord: "חלוקות",
    activeGroupsCountLabel: "{n} קבוצות פעילות",
    splitsCountLabel: "{n} חלוקות",
    totalSpentLabel: "סה״כ הוצאות",
    billAttachedToGroup: "חשבון משויך לקבוצה",
    linkedBadge: "מקושר ✓",
    eachLabel: "לכל אחד",
    deleteGroupItem: "מחק קבוצה",
    shareGroupItem: "שתף קבוצה",
    seeGroupDetails: "צפה בפרטי קבוצה",
    backToOptions: "חזור לאפשרויות",
    whoPaidUpfront: "מי שילם את החשבון?",
    confirmLeaveGroup: "האם אתה בטוח שברצונך לעזוב את הקבוצה?",
    leaveGroup: "עזוב קבוצה",

    // Alerts & Messages
    codeNotFound: "קוד סשן לא נמצא. אנא בדוק את הקוד בן 4 הספרות.",
    couldNotParse: "לא ניתן לפענח את הקבלה. אנא צלם תמונה ברורה או הזן פריטים ידנית.",
    errorUploading: "שגיאה בהעלאת תמונת הקבלה."
  }
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  NIS: "₪",
  ILS: "₪",
  USD: "$",
  EUR: "€",
  GBP: "£"
};

// Base mapping: Number of units of currency per 1 USD
export const LIVE_RATES_FROM_USD: Record<string, number> = {
  USD: 1.0,
  NIS: 3.65,
  ILS: 3.65,
  EUR: 0.92,
  GBP: 0.78
};

export function updateLiveExchangeRates(newRates: Record<string, number>) {
  if (newRates && typeof newRates === 'object') {
    Object.keys(newRates).forEach((k) => {
      const val = newRates[k];
      if (typeof val === 'number' && val > 0) {
        LIVE_RATES_FROM_USD[k.toUpperCase()] = val;
      }
    });
  }
}

export function normalizeCurrencyCode(curr: string): string {
  if (!curr) return 'NIS';
  const c = String(curr).trim().toUpperCase();
  if (c.includes('$') || c.includes('USD') || c.includes('DOLLAR')) return 'USD';
  if (c.includes('₪') || c.includes('NIS') || c.includes('ILS') || c.includes('SHEKEL')) return 'NIS';
  if (c.includes('€') || c.includes('EUR') || c.includes('EURO')) return 'EUR';
  if (c.includes('£') || c.includes('GBP') || c.includes('POUND')) return 'GBP';
  return 'NIS';
}

export function formatCurrency(amount: number, currency: string = "NIS"): string {
  const code = normalizeCurrencyCode(currency);
  const num = typeof amount === "number" ? amount : parseFloat(amount as any) || 0;
  const roundedNum = Math.round((num + Number.EPSILON) * 100) / 100;
  const formattedStr = roundedNum.toFixed(2);
  
  if (code === "NIS" || code === "ILS") {
    return `${formattedStr} NIS`;
  }
  return `${formattedStr} ${code}`;
}

export function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  const num = typeof amount === "number" ? amount : parseFloat(amount as any) || 0;

  if (from === to || isNaN(num)) {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  const defaultRates: Record<string, number> = {
    USD: 1.0,
    NIS: 3.65,
    ILS: 3.65,
    EUR: 0.92,
    GBP: 0.78
  };

  const fromRateInUSD = (typeof LIVE_RATES_FROM_USD[from] === 'number' && LIVE_RATES_FROM_USD[from] > 0)
    ? LIVE_RATES_FROM_USD[from]
    : (defaultRates[from] || 1.0);

  const toRateInUSD = (typeof LIVE_RATES_FROM_USD[to] === 'number' && LIVE_RATES_FROM_USD[to] > 0)
    ? LIVE_RATES_FROM_USD[to]
    : (defaultRates[to] || 1.0);

  // Calculate: (amount / fromRateInUSD) * toRateInUSD
  const amountInUSD = num / fromRateInUSD;
  const converted = amountInUSD * toRateInUSD;

  return Math.round((converted + Number.EPSILON) * 100) / 100;
}

export function formatDualPrice(
  amount: number,
  billCurrency: string = 'NIS',
  userCurrency: string = 'NIS'
): { primary: string; secondary?: string } {
  try {
    const rawVal = typeof amount === 'number' ? amount : parseFloat(amount as any) || 0;
    const val = Math.round((rawVal + Number.EPSILON) * 100) / 100;
    const bCurr = normalizeCurrencyCode(billCurrency);
    const uCurr = normalizeCurrencyCode(userCurrency);

    const primary = formatCurrency(val, bCurr);
    if (!uCurr || bCurr === uCurr) {
      return { primary };
    }
    const converted = convertCurrency(val, bCurr, uCurr);
    const secondary = `(${formatCurrency(converted, uCurr)})`;
    return { primary, secondary };
  } catch (err) {
    const rawVal = typeof amount === 'number' ? amount : parseFloat(amount as any) || 0;
    return { primary: `${rawVal.toFixed(2)} ${billCurrency || 'NIS'}` };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    translations,
    CURRENCY_SYMBOLS,
    LIVE_RATES_FROM_USD,
    updateLiveExchangeRates,
    normalizeCurrencyCode,
    formatCurrency,
    convertCurrency,
    formatDualPrice
  };
}
