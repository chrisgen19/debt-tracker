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

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```

The production build intentionally uses webpack because restricted/containerized environments can prevent Turbopack from opening its internal worker port.
