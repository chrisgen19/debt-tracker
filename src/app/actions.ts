"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { normalizeCategories } from "@/lib/categories";
import { prisma } from "@/lib/prisma";

type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

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
    await prisma.debt.create({
      data: {
        itemName: parsed.data.itemName, amount: parsed.data.amount, category: parsed.data.category,
        paymentMethod: parsed.data.paymentMethod, lenderId: parsed.data.lenderId, borrowerId: parsed.data.borrowerId,
        incurredAt, notes: parsed.data.notes || null, status: parsed.data.status,
        paidAt, householdId: user.householdId!, createdById: user.id,
        // An entry logged as already settled belongs in the payment history too.
        paymentEvents: settledNow
          ? { create: { type: "PAID", amount: parsed.data.amount, occurredAt: paidAt!, householdId: user.householdId!, actorId: user.id } }
          : undefined,
      },
    });
    revalidatePath("/dashboard");
    return { ok: true, message: "Debt recorded" };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not save this debt" }; }
}

export async function setDebtStatus(id: string, status: "DEBT" | "PAID"): Promise<ActionResult> {
  try {
    const user = await actor();
    const debt = await prisma.debt.findFirst({ where: { id, householdId: user.householdId! }, select: { amount: true } });
    if (!debt) return { ok: false, error: "Debt not found" };
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
      await tx.debt.update({ where: { id }, data: { paidAt: status === "PAID" ? occurredAt : null } });
      await tx.paymentEvent.create({
        data: {
          type: status === "PAID" ? "PAID" : "UNPAID", amount: debt.amount, occurredAt,
          debtId: id, householdId: user.householdId!, actorId: user.id,
        },
      });
      return true;
    });
    if (!applied) return { ok: true };
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

export async function setDebtStatusBulk(ids: string[], status: "DEBT" | "PAID"): Promise<ActionResult> {
  try {
    const user = await actor();
    const parsed = debtIdsSchema.safeParse(ids);
    if (!parsed.success) return { ok: false, error: "Select between 1 and 2000 entries" };
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
        data: { paidAt: status === "PAID" ? occurredAt : null },
      });
      await tx.paymentEvent.createMany({
        data: updated.map((debt) => ({
          type: status === "PAID" ? ("PAID" as const) : ("UNPAID" as const), amount: debt.amount, occurredAt,
          debtId: debt.id, householdId: user.householdId!, actorId: user.id,
        })),
      });
      return updated.length;
    });
    if (!changed) return { ok: true };
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
