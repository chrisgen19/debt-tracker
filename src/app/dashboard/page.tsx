import { addMonths, endOfMonth, format, isValid, parse } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { DashboardClient } from "@/components/dashboard-client";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const query = await searchParams;
  const requested = typeof query.month === "string" ? parse(query.month, "yyyy-MM", new Date()) : new Date();
  const month = isValid(requested) ? requested : new Date();
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = addMonths(start, 1);

  const [monthDebts, paidByMe, paidToMe, openAll] = await Promise.all([
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
    prisma.debt.findMany({
      where: { householdId: user.householdId!, status: "DEBT" },
      select: { amount: true, borrowerId: true, lenderId: true },
    }),
  ]);

  const debts = monthDebts.map((debt) => ({
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
  }));

  const youOwe = debts.filter((d) => d.borrower.id === user.id && d.status === "DEBT").reduce((sum, d) => sum + d.amount, 0);
  const owedToYou = debts.filter((d) => d.lender.id === user.id && d.status === "DEBT").reduce((sum, d) => sum + d.amount, 0);
  const allTimeYouOwe = openAll.filter((d) => d.borrowerId === user.id).reduce((sum, d) => sum + Number(d.amount), 0);
  const allTimeOwedToYou = openAll.filter((d) => d.lenderId === user.id).reduce((sum, d) => sum + Number(d.amount), 0);

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
      debts={debts}
      month={{ key: format(start, "yyyy-MM"), label: format(start, "MMMM yyyy"), previous: format(addMonths(start, -1), "yyyy-MM"), next: format(addMonths(start, 1), "yyyy-MM") }}
      summary={{ youOwe, owedToYou, paidByYou: Number(paidByMe._sum.amount ?? 0), paidToYou: Number(paidToMe._sum.amount ?? 0), allTimeYouOwe, allTimeOwedToYou }}
      chart={days}
    />
  );
}
