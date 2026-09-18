# Owewell

A private two-person debt tracker for cash loans and shared credit-card purchases. Owewell keeps a daily ledger, shows both directions of debt, tracks repayments by payment date, and summarizes each month on a responsive dashboard.

## Included

- Email/password authentication with Better Auth
- Private two-person households with shareable invite codes
- Cash and credit-card entries with item, amount, category, notes, date/time, borrower, lender, and status
- Monthly navigation, daily ledger groups, search, status filters, and activity chart
- “You owe,” “owed to you,” paid-this-month, received-this-month, and all-time net balance
- Household name and currency settings
- Responsive desktop and mobile layouts built with Tailwind CSS and shadcn-style components
- PostgreSQL persistence through Prisma 7

## Run locally

Requirements: Node.js 20.19+ and PostgreSQL.

1. Copy `.env.example` to `.env` and set a random `BETTER_AUTH_SECRET`.
2. Ensure PostgreSQL is running and that this database URL is valid:

   ```text
   postgres://myuser:mypassword@localhost:5432/debt-tracker
   ```

3. Install, migrate, and run:

   ```bash
   pnpm install
   pnpm db:migrate
   pnpm dev
   ```

Open [http://localhost:3000](http://localhost:3000). The first person creates an account and shares the invite code shown in the dashboard. The second person creates their own account, selects “I have their code,” and joins the first household.

## Receipt storage

Entries can carry an optional receipt image: one attached when the entry is logged, and
one attached when it is settled. Marking several entries paid at once uploads a single
image and links it to all of them, because one GCash or Maribank transfer often clears
several debts.

Images live in a **private** Cloudflare R2 bucket. Nothing is ever served from a public
bucket URL: `/api/receipts/<id>` checks the session and the viewer's household, then
redirects to a five-minute signed URL.

These four variables are optional. Leave them unset and the app runs normally with every
receipt affordance hidden, so the feature can be deployed before the bucket exists.

```bash
R2_ACCOUNT_ID=""            # the hex id inside your R2 endpoint URL
R2_BUCKET="owewell-receipts"
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
```

Setting up the bucket:

1. Create a bucket with **public access off** and no custom domain.
2. Add a CORS policy allowing `PUT` from your origins, or browser uploads fail even
   though the signature is valid:

   ```json
   [
     {
       "AllowedOrigins": ["https://debt.cgdev.site", "http://localhost:3000"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

3. Create an R2 API token with **Object Read & Write**, scoped to that one bucket.

Uploads go straight from the browser to R2 over a presigned `PUT`, never through this
server: a Server Action request is capped at 1MB and a phone photo is several times
that. Images are downscaled to 1600px and re-encoded client-side first, which also
strips EXIF GPS data from phone photos.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```

The production build intentionally uses webpack because restricted/containerized environments can prevent Turbopack from opening its internal worker port.
