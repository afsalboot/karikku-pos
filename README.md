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

## Workspace backup and reset

Administrators can use **Settings → Data & Backup** to create a password-encrypted `.kbackup` archive. Choose Local / External Drive, Google Drive, or Both. Folder selection uses the browser's File System Access API where available; otherwise save the browser download to the desired local or external drive. A selected folder lasts for the current browser session. Backups are manual, not scheduled.

Archives use AES-256-GCM, a randomly salted scrypt password key, gzip, and MongoDB Extended JSON to retain IDs and dates. Keep the backup password separately: the app does not save it and cannot recover it. Backups include operational records, products/categories, settings and login accounts. External product-image files and environment secrets are not bundled; image URLs are retained. Google connection credentials are excluded and must be reconnected after recovery. This application backup is limited to 25 MB of raw BSON / 50 MB of serialized data; larger databases require a database backup tool.

**Reset Workspace** clears sales, expenses, customers and their balances, loyalty transactions, day sessions and cash movements. Products, categories, expense categories, settings, invoice numbering and login credentials remain. All active logins are invalidated, including other checkout tabs. Reset requires a backup from the same login made within 15 minutes, acknowledgement that the file and password are saved, the administrator password, and the exact phrase `RESET WORKSPACE`. Any ordinary workspace write after the backup makes the confirmation stale. The reset uses the same transaction lock as checkout and session closing and retains a reset audit entry. No reset runs automatically.

### Google Drive setup

1. Enable Google Drive API in your Google Cloud project and configure its OAuth consent screen. Create a **Web application** OAuth client. If the project is in testing, add your Google account as a test user; testing-mode authorizations can expire and require reconnection.
2. Add the exact callback URL to its authorized redirect URIs: `https://YOUR-POS-HOST/api/backups/google-callback` (localhost may use `http://localhost:3000/api/backups/google-callback`).
3. Configure server-only `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REDIRECT_URI` and `BACKUP_TOKEN_KEY` as shown in `.env.example`. Generate the 32-byte hexadecimal token key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it private and persistent; changing it requires reconnecting Google Drive.
4. Restart the app. Under Data & Backup, click **Connect Google Drive** and grant access. Backups create a **Karikku POS Backups** folder in that account. The `drive.file` scope limits access to app-created/selected files. If the folder is deleted or access is revoked, reconnect to create a new destination.

See Google's [web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) and [Drive upload guide](https://developers.google.com/workspace/drive/api/guides/manage-uploads). Live Drive connection/upload requires your own credentials and consent. Disconnect removes the local saved credential; you can also revoke the app in your Google account permissions.

### Verify or recover an archive

Set `BACKUP_PASSWORD` in the shell and run `node scripts/restore-backup.mjs PATH_TO_FILE.kbackup`. This verifies decryption and reports collection counts without writing a database. To recover, explicitly set `MONGODB_URI` and `MONGODB_DB_NAME` to an **empty replica-set database**, then add `--apply`. The script refuses an existing populated database, restores records in a transaction, recreates model indexes and invalidates restored login sessions. Configure the application to use the recovered database and sign in with its saved credentials. Clear the shell's `BACKUP_PASSWORD` afterward.

Run `NEXT_DIST_DIR=.next-backup` with the build/test process (PowerShell: `$env:NEXT_DIST_DIR='.next-backup'`), then `npm run build` and `node scripts/test-backups.mjs`. The suite uses disposable databases for destructive checks and recovery, and mocks Google endpoints; it does not reset a live shop or upload to a real Google account.
