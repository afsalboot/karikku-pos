# Receipt and Settings visual QA

final result: passed

Source visual truth: `D:/Next.js/Projects/karikku/Sources/Recept model.jpeg` (967 x 1600), with supplied `Receipt logo.jpeg` for the brand artwork.

Implementation evidence: `test-results/receipt-reference-match.png` (973 x 1821), `test-results/receipt-mobile.png` (1248 x 3200), and `test-results/settings-without-business.png`.

Viewport: desktop 1280 x 1200 CSS pixels, deviceScaleFactor 3.2; mobile 390 x 1000 CSS pixels at the same density. Receipt CSS width is 80mm (approximately 302px); the element screenshot is approximately 968px wide. Source and implementation were inspected together at approximately equal image widths, excluding application chrome. The screenshot height is content-driven and includes thermal paper margins. The fixture uses the source's invoice number, date, cashier, three items, quantities, prices and cash payment. It is intercepted only in the test browser, never inserted into the application's database.

Full-view comparison: same centered brand, address and phone hierarchy; separate invoice/date/time/cashier lines; numbered item grid; right-aligned amounts; bold total between rules; payment section and thank-you footer. Mobile preview has no horizontal receipt overflow and keeps Print Bill and Close visible.

Focused comparison: header artwork is the supplied raster logo, cropped in its display container without altering the source file. Item names, quantity/rate lines, all three amounts, subtotal and total were inspected at the near-source-width capture. All text is readable and the three source names fit on single lines at 80mm.

## Fidelity surfaces

- Typography: Arial body, bold item names and total match the sample's hierarchy. Script footer uses a Windows system font; exact lettering is a P3 difference.
- Spacing: compact item rows and consistent column alignment. Retained 3mm thermal margins and slightly larger vertical spacing than the flat reference are intentional for printable output.
- Colors: black on white, pale gray table heading, dashed item separators and solid total rules.
- Assets: original supplied Karikku logo, with library phone/location icons. Their outline style and absence of decorative footer flourishes are P3 differences from the source.
- Content: source address and phone are fixed branding; invoice, date, time, cashier, items, totals and payments use the current sale. Existing optional customer, variant, addon, discount, tax, loyalty and non-completed status information remains supported.

## Comparison history

1. Initial same-content screenshot was too tall, with oversized row spacing and total/footer type (P2).
2. Reduced logo width, body line height, item padding and type sizes. Recaptured `receipt-reference-match.png` and compared alongside the reference. No remaining actionable P0/P1/P2 findings.

## Interaction and print checks

- Existing isolated MongoDB / Playwright checkout, historical invoice preservation and print checks pass.
- Settings opens on Invoice & Receipt; General business category, Business Name input and file upload are absent.
- Invoice settings save successfully after removing the business form.
- Receipt preview and Print Bill work; generated PDFs are one page at both 80mm and 58mm.
- Reference fixture renders three items and a total of INR 1,320.00.
- Mobile receipt has no horizontal overflow. No browser page errors in the visual fixture flow.
- Lint, 29 unit tests and isolated production build pass.

Physical receipt-printer output remains untested. Browser PDF verification does not establish device-specific feed, ink density or printer-driver settings.
