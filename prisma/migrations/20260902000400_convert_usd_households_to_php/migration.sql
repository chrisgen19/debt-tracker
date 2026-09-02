-- Convert households that still use the original application default.
UPDATE "Household"
SET "currency" = 'PHP'
WHERE "currency" = 'USD';
