# Hebrew OCR release gate

EasySplit targets at least **96% correct purchased-item rows** for Hebrew receipts.
A row counts as correct only when:

- its line price is exact to the cent; and
- its normalized Hebrew item-name similarity is at least 90%.

`npm run test:ocr-hebrew` runs the real browser Tesseract pipeline against the
checked-in synthetic receipt set (clean, skewed, thermal-print degradation, and
mobile JPEG compression). The build must reject unreadable or unreconciled
Hebrew output instead of displaying it as a successful scan.

Hebrew server OCR also requires exact purchased-row agreement between the two
pinned Gemini models. The local fallback requires exact item-name agreement
between Hebrew+English and Hebrew-only reads, uses a separate English numeric
read, and requires the extracted rows to reconcile with the printed total. Any
missing verifier, spelling disagreement, price disagreement, or deadline fails
closed and asks the user to retake the photo.

The synthetic gate protects the code path, but it is not a claim of 96%
real-world accuracy. Before a production accuracy claim, evaluate a private,
redacted set of at least 25 representative Israeli restaurant receipts and at
least 100 purchased-item rows. Keep that evaluation set outside Git because
receipts can contain personal or payment information.
