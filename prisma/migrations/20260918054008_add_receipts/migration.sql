-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING', 'STORED');

-- AlterTable
ALTER TABLE "Debt" ADD COLUMN     "borrowReceiptId" TEXT,
ADD COLUMN     "paidReceiptId" TEXT;

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "householdId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_key_key" ON "Receipt"("key");

-- CreateIndex
CREATE INDEX "Receipt_householdId_status_createdAt_idx" ON "Receipt"("householdId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_borrowReceiptId_fkey" FOREIGN KEY ("borrowReceiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_paidReceiptId_fkey" FOREIGN KEY ("paidReceiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
