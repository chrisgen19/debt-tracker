-- Seed the payment log from debts that were already settled before the log existed.
-- `createdById` is the best available actor for historical rows, and the id only
-- needs to be unique, so a uuid stands in for the cuid the app would generate.
INSERT INTO "PaymentEvent" (id, type, amount, "occurredAt", "createdAt", "debtId", "householdId", "actorId")
SELECT
    gen_random_uuid()::text,
    'PAID',
    d.amount,
    d."paidAt",
    now(),
    d.id,
    d."householdId",
    d."createdById"
FROM "Debt" d
WHERE d.status = 'PAID' AND d."paidAt" IS NOT NULL;
