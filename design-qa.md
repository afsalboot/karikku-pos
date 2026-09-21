# Calendar and dropdown UI verification

## Latest thermal animation revision

final result: passed

Supersedes the looping cream-printer treatment below. Per the latest request, checkout success is now a borderless full-viewport green/white screen, without the old dialog title bar, duplicate success text or pause/replay controls. The paper prints down once and remains visible. The animation renders the same `Receipt` component used for website invoices and physical printing, including logo, address, customer/cashier preferences, items, totals, payments and footer.

Evidence inspected: `test-results/thermal-fullscreen-desktop.png` at 1280 x 900 and `test-results/thermal-mobile-long-receipt.png` at 390 x 844. Receipt has a neutral white background; compact green printer matches the site's controls; Print receipt and New Sale remain outside any bordered footer. Long receipts scroll within the paper region. No outstanding P0/P1/P2 findings for this revision.

Validation: build and lint passed. Browser regression verifies exact viewport dimensions, zero dialog border, no restart after 8.2 seconds, unchanged printer position, matching visible/print receipt text, reduced motion, long receipts, mobile/tablet layout, print actions, 58mm/80mm one-page PDFs and no runtime errors. Physical printer/device testing is not claimed.

final result: passed

## Scope and references

Compared the supplied calendar screenshot and Dropdowns UI Design Collection with the rendered controls together in one image review. These are component references, not full-page layouts. The existing Karikku green palette, Arial typography, business values, and surrounding page layout are intentionally retained. Calendar reference uses March 2022; the app displays the selected live filter dates instead.

## Visual evidence

- `test-results/calendar-panel.png`: compact white calendar, paired date chips, Monday-first week, pale continuous range and solid green endpoints, restrained borders and month navigation.
- `test-results/dropdown-sales-desktop.png`: white menu, soft shadow, selected row and check, compact option spacing matching the reference's hierarchy.
- `test-results/calendar-sales-320.png`, `calendar-sales-390.png`, `calendar-sales-820.png`: responsive calendar stays inside the viewport.
- `test-results/dropdown-modal.png`: dropdown remains above the modal content without clipping.

Screenshots use Chromium at device scale factor 1, desktop 1440 x 1000 and responsive 320/390/820 x 956. Full-page screenshots may exceed viewport height. Calendar component capture was compared directly with the calendar source; dropdown comparison focuses on the open menu rather than the reference board's surrounding blank canvas.

## Findings and fixes

- P2: Calendar keyboard focus was deferred and could miss fast arrow input. Moved focus into the layout effect; date selection with Enter and arrows now passes.
- P2: At 320px, the existing profile name and role caused horizontal page overflow. Compact profile display now shows the avatar and caret while retaining identity in the menu. Post-fix screenshot and width assertion pass.
- Typography, spacing, colors, icons and actual control content reviewed. No new raster assets required; standard controls use existing icon components. No remaining P0/P1/P2 visual findings within this scope.

## Validation

- Production build and ESLint passed.
- 30 unit tests passed.
- 17 Playwright checks passed using a disposable MongoDB database: controlled dropdown values, keyboard and Escape interaction, date range highlighting and selection, mobile overflow, searchable category selection inside the product modal, cash movement persistence, settings draft selection, and browser errors.
- Physical touch devices and browsers other than Chromium were not tested. No production data was changed.

## Thermal payment animation — 20 September 2026

final result: passed

Reference: supplied Screen Recording 2026-09-20 093341.mp4, inspected at 1, 3, 5 and 7 seconds. Compared full-paper and success frames with the corresponding rendered component captures together. The source is a 562 x 568 recording; implementation is intentionally embedded in the existing checkout modal, with a 340px maximum printer width. Real invoice contents replace the reference's example products and amounts.

- Evidence: `test-results/printer-reference-3.png`, `printer-reference-5.png`, `thermal-feed-completed.png`, `thermal-success.png`, `thermal-mobile-long-receipt.png`, `thermal-tablet-reduced-motion.png`.
- Matches: fixed rounded cream printer, narrow dark slot, restrained warm shading, off-white monospace paper, soft shadows, serrated edge, actual downward sheet translation, retraction, staggered success text and working print action. No video, canvas, audio, flashing lights or printer vibration in the implementation.
- Intentional adaptations: Karikku's modal/footer actions remain available; success subtitle is shop-appropriate; pause reveals all invoice lines; reduced motion provides a static scrollable receipt. The loop is approximately 8 seconds and holds while its print button has keyboard focus.
- P2 resolved: an incorrectly positioned slot shadow left a horizontal stripe below the success button. Replaced it with a fixed shadow at the slot; inspected the revised success screenshot.
- Typography, paper spacing, warm colors, icon quality and dynamic text reviewed. No remaining P0/P1/P2 findings. Physical devices and non-Chromium browsers remain untested.
- Validation: disposable-database checkout regression verifies downward motion, stable printer bounds, retraction, success, looping, pause, print during animation, 40-line receipts, reduced motion, tablet/mobile layout and no browser errors. Printed output remains one 80.1mm page (130.9mm high for the tested sale), and the 58mm PDF check passes. Production database untouched.
