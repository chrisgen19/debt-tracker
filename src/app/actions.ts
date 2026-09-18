"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { normalizeCategories } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { copyReceiptObject, deleteReceiptObject, presignReceiptPut, receiptObjectPrefix, receiptObjectSize } from "@/lib/r2";
import { IMAGE_SNIFF_BYTES, MAX_RECEIPT_BYTES, promotedKey, sniffImageType, stagingReceiptKey, validateReceiptUpload } from "@/lib/receipts";

type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

type UploadTicket = { ok: true; receiptId: string; uploadUrl: string } | { ok: false; error: string };

/** `promoted` marks the request that actually moved the object out of staging, and so
 *  the only one entitled to move it back if the work it was for falls through. */
type ConfirmedReceipt = { id: string; promoted: boolean };

const debtSchema = z.object({
  itemName: z.string().trim().min(2, "Add a descriptive item name").max(100),
  amount: z.coerce.number().positive("Amount must be greater than zero").max(99999999),
  category: z.string().trim().min(1).max(40),
  paymentMethod: z.enum(["CASH", "CREDIT_CARD"]),
  lenderId: z.string().min(1),
  borrowerId: z.string().min(1),
  incurredAt: z.string().min(1),
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(["DEBT", "PAID"]),
  borrowReceiptId: z.string().min(1).optional(),
});

const uploadSchema = z.object({
  contentType: z.string().min(1),
  size: z.coerce.number().int().positive(),
});

const categoryConfigSchema = z.array(z.object({
  name: z.string().trim().min(1).max(30),
  ideas: z.array(z.string().trim().min(1).max(40)).max(12),
})).min(1).max(20);

/// Only the all-time paid list is capped on the dashboard; the month, unpaid and
/// paid-this-month lists are unbounded, and "Select all" on the unpaid view spans
/// every month. So this is a guard against an abusive payload rather than a mirror
/// of any UI limit, and it sits far above what a two-person ledger reaches. Even at
/// this size the three statements below stay well inside Postgres' parameter limit.
const debtIdsSchema = z.array(z.string().min(1)).min(1).max(2000);

function entryCount(count: number) {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

async function actor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("You must be signed in");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.householdId) throw new Error("Your household could not be found");
  return user;
}

/**
 * Reserve a receipt row and hand back a URL the browser can upload one image to.
 *
 * The file itself never passes through this server: a Server Action request is capped
 * at 1MB and a phone photo is several times that, so the bytes go browser to R2 over a
 * presigned PUT and only the id comes back here. The row starts PENDING and is worth
 * nothing until `confirmReceipt` has seen the object in the bucket.
 */
export async function createReceiptUpload(input: unknown): Promise<UploadTicket> {
  try {
    const user = await actor();
    const parsed = uploadSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "That file could not be read" };
    // Re-checked server-side on purpose: the browser runs the same rules first, but
    // only to fail fast, never as the control.
    const valid = validateReceiptUpload(parsed.data);
    if (!valid.ok) return { ok: false, error: valid.error };
    // The key is final before the insert. Writing a placeholder and correcting it a
    // statement later collided on the unique index between two reservations racing,
    // and a crash in between left an empty key wedged there blocking every later one.
    // It points at staging: `confirmReceipt` copies the object to its real key once it
    // has been checked, and that key is never presigned for writing.
    const key = stagingReceiptKey(user.householdId!, randomUUID(), valid.contentType);
    const receipt = await prisma.receipt.create({
      data: { key, contentType: valid.contentType, householdId: user.householdId!, uploadedById: user.id },
      select: { id: true },
    });
    // Signing the exact length is what actually caps storage. The confirmation checks
    // below only run when a caller comes back to link the receipt, and an abuser simply
    // would not, so the ceiling has to bite at upload time.
    return { ok: true, receiptId: receipt.id, uploadUrl: await presignReceiptPut(key, valid.contentType, parsed.data.size) };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not start the upload" }; }
}

/**
 * Promote a pending receipt to STORED, but only if R2 really has the object.
 *
 * A browser can always claim an upload succeeded, so the bucket is the only witness
 * that counts. Deliberately called *before* opening a database transaction: it makes a
 * network round trip to R2, and holding row locks across that would be a bad trade.
 *
 * Returns the id to link, or null when the caller passed no receipt at all. Throws when
 * a receipt was named but cannot be honoured, so the surrounding action reports it
 * rather than silently settling an entry with no evidence attached.
 */
async function confirmReceipt(receiptId: string | undefined, householdId: string): Promise<ConfirmedReceipt | null> {
  if (!receiptId) return null;
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, householdId },
    select: { id: true, key: true, status: true },
  });
  if (!receipt) throw new Error("That receipt could not be found");
  if (receipt.status === "STORED") return { id: receipt.id, promoted: false };

  const byteSize = await receiptObjectSize(receipt.key);
  if (byteSize === null) throw new Error("The receipt did not finish uploading");

  // The presigned PUT pins the Content-Type *header*, never the bytes or their length,
  // so everything the browser claimed has to be re-established from what R2 actually
  // holds. A rejected object is removed rather than left sitting in the bucket.
  const reject = async (message: string) => {
    await deleteReceiptObject(receipt.key);
    // Conditional on the row still being the pending one this request read. A second
    // request confirming the same receipt may already have promoted it, and deleting
    // by id alone would then unlink a receipt from the entry that request just settled.
    await prisma.receipt.deleteMany({ where: { id: receipt.id, status: "PENDING", key: receipt.key } });
    throw new Error(message);
  };
  if (byteSize === 0) await reject("That receipt uploaded empty");
  if (byteSize > MAX_RECEIPT_BYTES) await reject(`Receipts must be under ${Math.floor(MAX_RECEIPT_BYTES / 1024 / 1024)}MB`);
  const prefix = await receiptObjectPrefix(receipt.key, IMAGE_SNIFF_BYTES);
  if (!prefix || sniffImageType(prefix) === null) await reject("That receipt is not a readable image");

  // Moved out of staging only once it has passed. The upload URL stays valid for the
  // rest of its five minutes, so leaving a confirmed receipt at the key that URL writes
  // to would let the bytes be swapped after they were accepted, and a receipt that can
  // be changed after the fact is not evidence of anything.
  const key = promotedKey(receipt.key);
  if (!(await copyReceiptObject(receipt.key, key))) await reject("That receipt could not be stored");

  // Guarded on PENDING so two concurrent confirmations cannot both claim the promotion.
  // A count of zero means the other one got there first; the row is STORED either way,
  // and only the request that actually moved it is allowed to undo it later.
  const { count } = await prisma.receipt.updateMany({
    where: { id: receipt.id, status: "PENDING" },
    data: { key, status: "STORED", byteSize },
  });
  // Only now, with the row pointing at the final key, is the staged copy redundant.
  // A failure here is harmless: the lifecycle rule on the staging prefix collects it.
  await deleteReceiptObject(receipt.key);
  return { id: receipt.id, promoted: count > 0 };
}

/**
 * Undo a promotion when the work it was meant for did not happen.
 *
 * Promotion moves an object out of `staging/`, which is the only prefix the lifecycle
 * rule sweeps, so a receipt promoted for a settle that turned out to change nothing
 * would sit in the bucket forever. Signup is open, so that is a storage-abuse path
 * rather than a tidiness problem: name a debt id that cannot transition, repeat.
 *
 * Only ever touches a receipt this request promoted and that nothing has since linked.
 */
async function discardReceipt(confirmed: ConfirmedReceipt | null, householdId: string): Promise<void> {
  if (!confirmed?.promoted) return;
  const unlinked = { borrowFor: { none: {} }, paidFor: { none: {} } } as const;
  const receipt = await prisma.receipt.findFirst({
    where: { id: confirmed.id, householdId, ...unlinked },
    select: { id: true, key: true },
  });
  if (!receipt) return;
  await deleteReceiptObject(receipt.key);
  await prisma.receipt.deleteMany({ where: { id: receipt.id, ...unlinked } });
}

export async function createDebt(input: unknown): Promise<ActionResult> {
  try {
    const user = await actor();
    const parsed = debtSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    if (parsed.data.lenderId === parsed.data.borrowerId) return { ok: false, error: "Lender and borrower must be different people" };
    const members = await prisma.user.count({ where: { id: { in: [parsed.data.lenderId, parsed.data.borrowerId] }, householdId: user.householdId } });
    if (members !== 2) return { ok: false, error: "Both people must belong to your household" };
    const household = await prisma.household.findUnique({ where: { id: user.householdId! }, select: { categoryConfig: true } });
    const categories = normalizeCategories(household?.categoryConfig);
    if (!categories.some((category) => category.name === parsed.data.category)) {
      return { ok: false, error: "Choose a category from your household settings" };
    }
    const incurredAt = new Date(parsed.data.incurredAt);
    if (Number.isNaN(incurredAt.getTime())) return { ok: false, error: "Choose a valid date and time" };
    const settledNow = parsed.data.status === "PAID";
    const paidAt = settledNow ? new Date() : null;
    const confirmed = await confirmReceipt(parsed.data.borrowReceiptId, user.householdId!);
    const borrowReceiptId = confirmed?.id ?? null;
    try {
      await prisma.debt.create({
      data: {
        itemName: parsed.data.itemName, amount: parsed.data.amount, category: parsed.data.category,
        paymentMethod: parsed.data.paymentMethod, lenderId: parsed.data.lenderId, borrowerId: parsed.data.borrowerId,
        incurredAt, notes: parsed.data.notes || null, status: parsed.data.status,
        paidAt, householdId: user.householdId!, createdById: user.id, borrowReceiptId,
        // An entry logged as already settled belongs in the payment history too.
        paymentEvents: settledNow
          ? { create: { type: "PAID", amount: parsed.data.amount, occurredAt: paidAt!, householdId: user.householdId!, actorId: user.id } }
          : undefined,
        },
      });
    } catch (error) {
      // The receipt was promoted for an entry that never existed, so hand it back
      // rather than leave it stranded outside the swept prefix.
      await discardReceipt(confirmed, user.householdId!);
      throw error;
    }
    revalidatePath("/dashboard");
    return { ok: true, message: "Debt recorded" };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not save this debt" }; }
}

export async function setDebtStatus(id: string, status: "DEBT" | "PAID", receiptId?: string): Promise<ActionResult> {
  try {
    const user = await actor();
    const debt = await prisma.debt.findFirst({ where: { id, householdId: user.householdId! }, select: { amount: true } });
    if (!debt) return { ok: false, error: "Debt not found" };
    // Settled outside the transaction: it round-trips to R2, and the row locks below
    // should not be held across a network call.
    const confirmed = status === "PAID" ? await confirmReceipt(receiptId, user.householdId!) : null;
    const paidReceiptId = confirmed?.id ?? null;
    // The status guard lives in the UPDATE rather than in a preceding read: two
    // requests racing on the same entry would otherwise both see the old status
    // and each append an event for what is really one transition.
    const applied = await prisma.$transaction(async (tx) => {
      const { count } = await tx.debt.updateMany({
        where: { id, householdId: user.householdId!, status: { not: status } },
        data: { status },
      });
      if (count === 0) return false;
      // Stamped only once the row lock is held, so a request that stalled before
      // the transaction cannot write a timestamp older than one already committed.
      const occurredAt = new Date();
      // `paidReceiptId` rides along with `paidAt`: un-paying an entry retracts the
      // evidence of settlement as well as the timestamp.
      await tx.debt.update({
        where: { id },
        data: { paidAt: status === "PAID" ? occurredAt : null, paidReceiptId },
      });
      await tx.paymentEvent.create({
        data: {
          type: status === "PAID" ? "PAID" : "UNPAID", amount: debt.amount, occurredAt,
          debtId: id, householdId: user.householdId!, actorId: user.id,
        },
      });
      return true;
    });
    if (!applied) {
      await discardReceipt(confirmed, user.householdId!);
      return { ok: true };
    }
    revalidatePath("/dashboard");
    return { ok: true, message: status === "PAID" ? "Marked as paid" : "Moved back to debt" };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not update this debt" }; }
}

export async function deleteDebt(id: string): Promise<ActionResult> {
  try {
    const user = await actor();
    const debt = await prisma.debt.findFirst({ where: { id, householdId: user.householdId! }, select: { id: true } });
    if (!debt) return { ok: false, error: "Debt not found" };
    await prisma.debt.delete({ where: { id } });
    revalidatePath("/dashboard");
    return { ok: true, message: "Entry deleted" };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not delete this entry" }; }
}

export async function setDebtStatusBulk(ids: string[], status: "DEBT" | "PAID", receiptId?: string): Promise<ActionResult> {
  try {
    const user = await actor();
    const parsed = debtIdsSchema.safeParse(ids);
    if (!parsed.success) return { ok: false, error: "Select between 1 and 2000 entries" };
    // Checked before anything is promoted. Confirming first would move the object out
    // of the swept staging prefix on the way to discovering that nothing can transition,
    // and naming an ineligible id is free, so that is an open-ended way to fill the
    // bucket. The transaction below still re-checks; this only avoids the promotion.
    if (status === "PAID" && receiptId) {
      const eligible = await prisma.debt.count({
        where: { id: { in: parsed.data }, householdId: user.householdId!, status: { not: status } },
      });
      if (!eligible) return { ok: true };
    }
    // Confirmed once for the whole selection, outside the transaction. One GCash
    // transfer settling three debts is one object in R2 and one row here, linked from
    // all three, rather than the same screenshot stored three times.
    const confirmed = status === "PAID" ? await confirmReceipt(receiptId, user.householdId!) : null;
    const paidReceiptId = confirmed?.id ?? null;
    // Same reasoning as setDebtStatus: the status guard lives in the UPDATE so two
    // requests racing on the same entry cannot each append an event for what is
    // really one transition. `updateManyAndReturn` is a single UPDATE ... RETURNING,
    // so the whole selection settles in a fixed four statements and still reports
    // exactly which rows moved. The householdId is the authorization guard: ids from
    // another household match nothing rather than reporting that they exist.
    const changed = await prisma.$transaction(async (tx) => {
      const updated = await tx.debt.updateManyAndReturn({
        where: { id: { in: parsed.data }, householdId: user.householdId!, status: { not: status } },
        data: { status },
        select: { id: true, amount: true },
      });
      if (!updated.length) return 0;
      // Stamped only once the row locks are held, so a request that stalled before
      // the transaction cannot write a timestamp older than one already committed.
      const occurredAt = new Date();
      await tx.debt.updateMany({
        where: { id: { in: updated.map((debt) => debt.id) } },
        data: { paidAt: status === "PAID" ? occurredAt : null, paidReceiptId },
      });
      await tx.paymentEvent.createMany({
        data: updated.map((debt) => ({
          type: status === "PAID" ? ("PAID" as const) : ("UNPAID" as const), amount: debt.amount, occurredAt,
          debtId: debt.id, householdId: user.householdId!, actorId: user.id,
        })),
      });
      return updated.length;
    });
    if (!changed) {
      // Lost the race after the check above: give the receipt back.
      await discardReceipt(confirmed, user.householdId!);
      return { ok: true };
    }
    revalidatePath("/dashboard");
    return { ok: true, message: `${entryCount(changed)} marked as ${status === "PAID" ? "paid" : "unpaid"}` };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not update these entries" }; }
}

export async function deleteDebts(ids: string[]): Promise<ActionResult> {
  try {
    const user = await actor();
    const parsed = debtIdsSchema.safeParse(ids);
    if (!parsed.success) return { ok: false, error: "Select between 1 and 2000 entries" };
    // The householdId in the filter is what keeps this scoped to your own entries.
    const { count } = await prisma.debt.deleteMany({ where: { id: { in: parsed.data }, householdId: user.householdId! } });
    if (!count) return { ok: false, error: "Those entries could not be found" };
    revalidatePath("/dashboard");
    return { ok: true, message: `${entryCount(count)} deleted` };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not delete these entries" }; }
}

export async function joinHousehold(code: string): Promise<ActionResult> {
  try {
    const user = await actor();
    const target = await prisma.household.findUnique({ where: { inviteCode: code.trim().toUpperCase() }, include: { members: true } });
    if (!target) return { ok: false, error: "That invite code does not exist" };
    if (target.id === user.householdId) return { ok: false, error: "You are already in this household" };
    if (target.members.length >= 2) return { ok: false, error: "That household already has two people" };
    const currentId = user.householdId!;
    if (await prisma.debt.count({ where: { householdId: currentId } })) return { ok: false, error: "Your current household has entries. Remove them before joining another household." };
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { householdId: target.id } });
      if ((await tx.user.count({ where: { householdId: currentId } })) === 0) await tx.household.delete({ where: { id: currentId } });
    });
    revalidatePath("/dashboard");
    return { ok: true, message: `Joined ${target.name}` };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not join this household" }; }
}

export async function updateHousehold(input: { name: string; currency: string }): Promise<ActionResult> {
  try {
    const user = await actor();
    const parsed = z.object({ name: z.string().trim().min(2).max(50), currency: z.enum(["USD", "PHP", "CNY", "EUR", "GBP", "AUD", "CAD", "SGD"]) }).safeParse(input);
    if (!parsed.success) return { ok: false, error: "Check your household settings" };
    await prisma.household.update({ where: { id: user.householdId! }, data: parsed.data });
    revalidatePath("/dashboard");
    return { ok: true, message: "Household updated" };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not update your household" }; }
}

export async function updateCategoryConfig(input: unknown): Promise<ActionResult> {
  try {
    const user = await actor();
    const parsed = categoryConfigSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your categories" };

    const names = parsed.data.map((category) => category.name.toLocaleLowerCase());
    if (new Set(names).size !== names.length) return { ok: false, error: "Category names must be unique" };

    const categories = parsed.data.map((category) => {
      const seen = new Set<string>();
      return {
        name: category.name,
        ideas: category.ideas.filter((idea) => {
          const key = idea.toLocaleLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
      };
    });

    await prisma.household.update({
      where: { id: user.householdId! },
      data: { categoryConfig: categories },
    });
    revalidatePath("/dashboard");
    return { ok: true, message: "Categories and quick picks updated" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update your categories" };
  }
}
