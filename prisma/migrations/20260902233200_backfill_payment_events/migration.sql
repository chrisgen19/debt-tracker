-- Seed the payment log from debts that were already settled before the log existed.
-- These rows get a NULL actor: nothing recorded who marked them paid, and the
-- entry's creator is a guess, not evidence. The id only needs to be unique, so a
-- uuid stands in for the cuid the app would generate.
INSERT INTO "PaymentEvent" (id, type, amount, "occurredAt", "createdAt", "debtId", "householdId", "actorId")
SELECT
    gen_random_uuid()::text,
    'PAID',
    d.amount,
    d."paidAt",
    now(),
    d.id,
    d."householdId",
    NULL
FROM "Debt" d
WHERE d.status = 'PAID' AND d."paidAt" IS NOT NULL;
