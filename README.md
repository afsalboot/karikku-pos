# Karikku Juice Shop POS

Next.js App Router application in JavaScript/JSX with MongoDB, Mongoose, JWT cookies, Zod, Recharts, Sonner, and react-to-print. Products are managed through an **Add Product modal** with inline category creation. No inventory, purchases, suppliers, or stock deduction are implemented.

## Run locally

Use Node.js 22 or later and a MongoDB replica set (MongoDB Atlas works). Transactions are required; a standalone MongoDB server is not supported.

```powershell
npm install
Copy-Item .env.example .env.local
```

Edit `.env.local` privately:

- `MONGODB_URI`: your MongoDB replica-set connection string and database name.
- `MONGODB_DB_NAME`: use `karikku_pos` to isolate this app from other applications on the same cluster. This overrides the database name in the URI. Restart the development server after changing it.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: server-side credentials for product image uploads. JPEG, PNG and WebP files up to 5 MB are supported. Images upload on product save; the square picker previews the selection immediately. Removing an image clears its product link without deleting the original Cloudinary asset.
- `JWT_SECRET`: a cryptographically random secret of at least 32 characters. Generate and store it securely; never commit it.
- `SEED_ADMIN_USERNAME`: initial administrator username (defaults to `admin`).
- `SEED_ADMIN_PASSWORD`: a unique password of 8–12 characters. This limit also applies when creating users or resetting passwords.

Then initialize the administrator and run the app:

```powershell
npm run seed:admin
npm run dev
```

Open http://localhost:3000 and sign in. Configure business information in Settings, add your menu in Products, and open a business day in Day Closing before taking payments. Remove `SEED_ADMIN_PASSWORD` from the environment once the administrator is created.

`seed:admin` does not reset existing accounts or create a sample menu. `npm run seed:demo` explicitly adds the sample categories/products requested in the brief; do not run that command against a real shop database unless you want those records.

For production:

```powershell
npm run build
npm start
```

Serve production over HTTPS so secure authentication cookies work. Configure the reverse proxy to preserve the public origin. Set secrets in the deployment's environment, and arrange database backups and restore checks before use with real payments.

## Features

- HTTP-only JWT login/logout, database-checked sessions, ADMIN/CASHIER permissions, password hashing, failed-login limits, session revocation, and last-administrator protection.
- Product search/pagination, add/edit modal, active status, inline category creation, optional variants and multiple add-ons. `/products/add` and `/products/:id/edit` open the corresponding modal through a redirect.
- POS category/search filters, product cards, cart quantities, item notes, fixed/percentage discounts, configurable payment methods, and checkout.
- Server-recalculated prices, integer-cent calculations, optional tax after discount, sequential unique invoices, immutable item/business receipt snapshots, and idempotent checkout retries.
- Sales filters, details, printing/reprinting, and administrator cancellations/refunds.
- Expenses with inline categories, filtering, pagination, editing, and confirmed soft deletion.
- Dashboard, sales/expense charts, payment breakdown, product/category/cashier reports, and net earnings labeled as Sales - Expenses.
- Single open business session, opening cash, expected cash, actual cash, difference, and preserved closed-session snapshots.
- User creation, roles, activation/deactivation, password reset, and configurable cashier permissions.
- Business/logo/receipt settings, 80mm and 58mm printing, configurable payment methods and optional GST.

## Business rules

- Payments are recorded, not processed by a payment gateway. Cash/UPI/Card/Other indicate payment already received. Refund/cancel actions record a full payment reversal; the operator must perform the actual cash or provider reversal.
- Checkout, refunds, expenses, settings, and session closing use transactions with a shared shop revision lock. Invoice allocation and sale creation commit together. Reusing a checkout request ID returns the original sale when the payload and cashier match.
- An open day is required for checkout and expenses. Expense dates match the open business date. Once a day closes, its expenses cannot be edited/deleted because that would alter reconciled cash.
- Same-session cash reversals reduce that session's cash sales. A later-session cash reversal reduces the currently open drawer while preserving the earlier closing snapshot.
- Cancelled/refunded sales remain in history and are excluded from completed-sales reports for the original sale date. Reports are sales-status summaries, not a general accounting ledger.
- Reporting dates use Asia/Kolkata. Maximum report range is 366 days. Product/category reports show up to 500 groups, with product/category revenue before bill discount and tax; payment/cashier totals include both.
- Cashiers can access sales history and printing. Products, users, settings administration, and reports are admin-only; cashier discounts, expenses, and day closing require their settings flags.
- Financial records are saved in MongoDB. Incomplete carts stay in memory. The earlier browser-only product prototype is not automatically imported; its existing browser data is not deleted.

## Code map

- `src/models`: the eight requested business models. The singleton Setting also stores the invoice sequence and transaction revision; no stock models exist.
- `src/lib`: MongoDB connection, authentication/JWT, validation, money/date calculations, API response handling, and client requests.
- `src/services`: catalog, checkout, expenses, reports, sessions, users, settings, authentication.
- `src/app/api/[...path]/route.js`: explicitly allowlisted REST resources/methods under `/api`; every resource performs its own permission checks.
- `src/app/(dashboard)`: protected server layout and page-level role checks.
- `src/components`, `src/context`, `src/hooks`: reusable UI, feature workspaces, cart state, and data hooks.

## Verification

```powershell
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The end-to-end runner starts its own disposable MongoDB replica set and production Next.js server on port 3101. It creates only isolated test accounts/data, generates temporary credentials in memory, and stops the test processes afterward. It never uses your configured shop database. Initial execution can download MongoDB and Chromium binaries.

Current checks cover 21 unit cases and 173 API/database/browser assertions, including administrator bootstrap, authorization, inline category/product creation, product summaries/search/availability/drawer/duplicate forms, sold-out checkout protection, variant/add-on checkout, server totals, idempotent retries, invoice sequencing, receipt snapshots, refunds, reporting, dashboard periods/hourly reconciliation/recent sales/session summaries/responsive layout, closed-session protection, session revocation, and concurrent checkout/day closing. Screenshots are generated in `test-results/` (gitignored).

The browser test verifies creation of the print document. Physical thermal printing, a live shop database, deployment HTTPS/proxy settings, operational backup restoration, and real payment-provider reversals still require verification in the target environment.

## References

The app uses current App Router protected layouts and route handlers. Transactions follow [Mongoose transaction guidance](https://mongoosejs.com/docs/transactions.html). Next.js 16 renamed the middleware convention to [Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy); authorization here is enforced in server pages and API services rather than relying on navigation middleware.

Product availability is independent of active status. Existing products without an `available` field remain available; no data migration is required. Sold-out products stay visible but disabled in New Sale, and checkout validates availability on the server. The Product model refreshes the availability field in cached schemas during hot reload while retaining strict validation.

Checkout supports Cash, UPI (displayed as GPay / UPI), Card and split allocations. New sales store `payments`, plus `cashReceived` and server-calculated `changeGiven` for cash. Allocations must equal the server total in paise; receipt, history, reports and day closing use applied amounts. Historical sales without a breakdown retain their original payment method, including Other; Other is unavailable for new checkout. Payment remains manually confirmed by the cashier, with no gateway charge or automatic refund integration.

Customers use server-side activity aggregation, search, filters, sorting and pagination. Lifetime orders/spending exclude cancelled and refunded sales; New This Month and Customer Sales cards cover the current India calendar month to date. Recent and full customer history preserve all invoice statuses and open the shared Sale Details drawer. Customer creation stays in Checkout with existing normalized-phone uniqueness and historical snapshots preserved.
