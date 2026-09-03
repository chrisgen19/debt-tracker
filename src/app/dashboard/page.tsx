import { addMonths, endOfMonth, format, isValid, parse } from "date-fns";
import { prisma } from "@/lib/prisma";
import { normalizeCategories } from "@/lib/categories";
import type { LedgerMode } from "@/lib/ledger";
import { requireUser } from "@/lib/session";
import { DashboardClient } from "@/components/dashboard-client";

const LEDGER_MODES: Record<string, LedgerMode> = {
  open: "OPEN",
  paid: "PAID_MONTH",
  "paid-all": "PAID_ALL",
};

/** Newest settle per entry, so a paid row can say who marked it rather than just when. */
const withLatestPayment = {
  lender: { select: { id: true, name: true } },
  borrower: { select: { id: true, name: true } },
  paymentEvents: {
    where: { type: "PAID" as const },
    orderBy: { occurredAt: "desc" as const },
    take: 1,
    select: { occurredAt: true, actor: { select: { id: true, name: true } } },
  },
};

/** The all-paid list is unbounded, so cap the rows rendered and report the true total separately. */
const PAID_ALL_LIMIT = 200;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const query = await searchParams;
  const ledgerMode = LEDGER_MODES[typeof query.ledger === "string" ? query.ledger : ""] ?? "MONTH";
  const requested = typeof query.month === "string" ? parse(query.month, "yyyy-MM", new Date()) : new Date();
  const month = isValid(requested) ? requested : new Date();
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = addMonths(start, 1);

  const paidMode = ledgerMode === "PAID_MONTH" || ledgerMode === "PAID_ALL";
  const [monthDebts, paidByMe, paidToMe, openSummary, openAll, paidList, paidAllCount, allTimePaid] = await Promise.all([
    prisma.debt.findMany({
      where: { householdId: user.householdId!, incurredAt: { gte: start, lt: end } },
      include: { lender: { select: { id: true, name: true } }, borrower: { select: { id: true, name: true } } },
      orderBy: { incurredAt: "desc" },
    }),
    prisma.debt.aggregate({
      where: { householdId: user.householdId!, borrowerId: user.id, status: "PAID", paidAt: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.debt.aggregate({
      where: { householdId: user.householdId!, lenderId: user.id, status: "PAID", paidAt: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.debt.groupBy({
      by: ["borrowerId", "lenderId"],
      where: { householdId: user.householdId!, status: "DEBT" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    ledgerMode === "OPEN"
      ? prisma.debt.findMany({
          where: { householdId: user.householdId!, status: "DEBT" },
          include: { lender: { select: { id: true, name: true } }, borrower: { select: { id: true, name: true } } },
          orderBy: { incurredAt: "desc" },
        })
      : Promise.resolve([]),
    // Paid views key off paidAt, so a July purchase settled in September lands in September.
    paidMode
      ? prisma.debt.findMany({
          where: {
            householdId: user.householdId!,
            status: "PAID",
            paidAt: ledgerMode === "PAID_MONTH" ? { gte: start, lt: end } : { not: null },
          },
          include: withLatestPayment,
          orderBy: { paidAt: "desc" },
          ...(ledgerMode === "PAID_ALL" ? { take: PAID_ALL_LIMIT } : {}),
        })
      : Promise.resolve([]),
    ledgerMode === "PAID_ALL"
      ? prisma.debt.count({ where: { householdId: user.householdId!, status: "PAID", paidAt: { not: null } } })
      : Promise.resolve(0),
    ledgerMode === "PAID_ALL"
      ? prisma.debt.groupBy({
          by: ["borrowerId", "lenderId"],
          where: { householdId: user.householdId!, status: "PAID", paidAt: { not: null } },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
  ]);

  const serializeDebt = (debt: (typeof monthDebts)[number]) => ({
    id: debt.id,
    itemName: debt.itemName,
    amount: Number(debt.amount),
    category: debt.category,
    paymentMethod: debt.paymentMethod,
    notes: debt.notes,
    incurredAt: debt.incurredAt.toISOString(),
    status: debt.status,
    paidAt: debt.paidAt?.toISOString() ?? null,
    lender: debt.lender,
    borrower: debt.borrower,
  });
  const debts = monthDebts.map(serializeDebt);
  const openDebts = openAll.map(serializeDebt);
  const paidDebts = paidList.map((debt) => {
    const settled = debt.paymentEvents[0];
    return {
      ...serializeDebt(debt),
      markedBy: settled?.actor ? { name: settled.actor.name, occurredAt: settled.occurredAt.toISOString() } : null,
    };
  });

  const youOwe = debts.filter((d) => d.borrower.id === user.id && d.status === "DEBT").reduce((sum, d) => sum + d.amount, 0);
  const owedToYou = debts.filter((d) => d.lender.id === user.id && d.status === "DEBT").reduce((sum, d) => sum + d.amount, 0);
  const openDebtCount = openSummary.reduce((sum, group) => sum + group._count._all, 0);
  const allTimeYouOwe = openSummary.filter((group) => group.borrowerId === user.id).reduce((sum, group) => sum + Number(group._sum.amount ?? 0), 0);
  const allTimeOwedToYou = openSummary.filter((group) => group.lenderId === user.id).reduce((sum, group) => sum + Number(group._sum.amount ?? 0), 0);
  const allTimePaidByYou = allTimePaid.filter((group) => group.borrowerId === user.id).reduce((sum, group) => sum + Number(group._sum.amount ?? 0), 0);
  const allTimePaidToYou = allTimePaid.filter((group) => group.lenderId === user.id).reduce((sum, group) => sum + Number(group._sum.amount ?? 0), 0);

  const days = Array.from({ length: endOfMonth(start).getDate() }, (_, index) => {
    const day = index + 1;
    const entries = debts.filter((debt) => new Date(debt.incurredAt).getDate() === day);
    return {
      day,
      borrowed: entries.filter((d) => d.borrower.id === user.id).reduce((sum, d) => sum + d.amount, 0),
      lent: entries.filter((d) => d.lender.id === user.id).reduce((sum, d) => sum + d.amount, 0),
    };
  });

  return (
    <DashboardClient
      currentUser={{ id: user.id, name: user.name, email: user.email }}
      household={{ id: user.household!.id, name: user.household!.name, inviteCode: user.household!.inviteCode, currency: user.household!.currency }}
      members={user.household!.members.map((member) => ({ id: member.id, name: member.name, email: member.email }))}
      categories={normalizeCategories(user.household!.categoryConfig)}
      debts={debts}
      openDebts={openDebts}
      paidDebts={paidDebts}
      paidTotal={ledgerMode === "PAID_ALL" ? paidAllCount : paidDebts.length}
      paidLimit={PAID_ALL_LIMIT}
      openDebtCount={openDebtCount}
      ledgerMode={ledgerMode}
      month={{ key: format(start, "yyyy-MM"), label: format(start, "MMMM yyyy"), previous: format(addMonths(start, -1), "yyyy-MM"), next: format(addMonths(start, 1), "yyyy-MM") }}
      summary={{ youOwe, owedToYou, paidByYou: Number(paidByMe._sum.amount ?? 0), paidToYou: Number(paidToMe._sum.amount ?? 0), allTimeYouOwe, allTimeOwedToYou, allTimePaidByYou, allTimePaidToYou }}
      chart={days}
      openEntryOnLoad={query.new === "1"}
    />
  );
}
