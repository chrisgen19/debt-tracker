"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  ArrowDownLeft, ArrowDownRight, ArrowLeft, ArrowRight, Banknote, CalendarDays, Check, CheckCircle2,
  ChevronDown, CreditCard, Ellipsis, HandCoins, Home, LayoutDashboard, LogOut,
  Plus, ReceiptText, Search, Settings2, Trash2, UserPlus, Users, WalletCards, X,
} from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { createDebt, deleteDebt, joinHousehold, setDebtStatus, updateCategoryConfig, updateHousehold } from "@/app/actions";
import { filterLedgerEntries, type DirectionFilter, type LedgerMode, type LedgerStatusFilter } from "@/lib/ledger";
import { formatMoney, initials } from "@/lib/utils";
import type { CategoryOption } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EntryModal } from "@/components/entry-modal";
import { CategorySettings } from "@/components/category-settings";
import { SummaryCarousel } from "@/components/summary-carousel";

type Member = { id: string; name: string; email: string };
type Debt = {
  id: string; itemName: string; amount: number; category: string; paymentMethod: "CASH" | "CREDIT_CARD";
  notes: string | null; incurredAt: string; status: "DEBT" | "PAID"; paidAt: string | null;
  lender: Pick<Member, "id" | "name">; borrower: Pick<Member, "id" | "name">;
};
type Props = {
  currentUser: Member;
  household: { id: string; name: string; inviteCode: string; currency: string };
  members: Member[];
  categories: CategoryOption[];
  debts: Debt[];
  openDebts: Debt[];
  openDebtCount: number;
  ledgerMode: LedgerMode;
  month: { key: string; label: string; previous: string; next: string };
  summary: { youOwe: number; owedToYou: number; paidByYou: number; paidToYou: number; allTimeYouOwe: number; allTimeOwedToYou: number };
  chart: { day: number; borrowed: number; lent: number }[];
};

export function DashboardClient(props: Props) {
  const { currentUser, household, members, categories, debts, openDebts, openDebtCount, ledgerMode, month, summary, chart } = props;
  const router = useRouter();
  const [entryOpen, setEntryOpen] = useState(false);
  const [entrySession, setEntrySession] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const currency = household.currency;
  const partner = members.find((member) => member.id !== currentUser.id);

  function openEntry() { setEntrySession((session) => session + 1); setEntryOpen(true); }
  function ledgerUrl(mode: LedgerMode, monthKey = month.key) {
    return `/dashboard?month=${monthKey}${mode === "OPEN" ? "&ledger=open" : ""}`;
  }
  function goToMonth(key: string) { router.push(ledgerUrl(ledgerMode, key)); }
  function showLedger(mode: LedgerMode, scroll = false) {
    router.push(ledgerUrl(mode), { scroll: false });
    if (scroll) document.getElementById("ledger")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) { toast.success(result.message); router.refresh(); } else toast.error(result.error);
    });
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground"><ArrowDownRight className="size-5" /></div><div><p className="font-display text-lg font-bold leading-none">Owewell</p><p className="mt-1 hidden text-[11px] font-semibold text-muted-foreground sm:block">{household.name}</p></div></div>
          <nav className="hidden items-center rounded-xl bg-secondary/70 p-1 md:flex"><span className="flex items-center gap-2 rounded-lg bg-card px-4 py-2 text-sm font-semibold shadow-sm"><LayoutDashboard className="size-4" />Overview</span><button onClick={() => setSettingsOpen(true)} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><Users className="size-4" />Household</button></nav>
          <div className="flex items-center gap-2"><Button onClick={openEntry} size="sm" disabled={!partner} className="hidden sm:flex"><Plus className="size-4" />Add entry</Button><button onClick={() => setSettingsOpen(true)} className="grid size-10 place-items-center rounded-full bg-[#dcebdc] text-sm font-bold text-primary">{initials(currentUser.name)}</button></div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-7 sm:px-6 lg:px-10 lg:pb-12">
        {!partner && <InviteBanner household={household} pending={pending} onJoin={(code) => run(() => joinHousehold(code))} />}
        <section className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div><p className="mb-2 text-sm font-semibold text-muted-foreground">Hello, {currentUser.name.split(" ")[0]} <span aria-hidden>👋</span></p><h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Here’s your money picture.</h1></div>
          <div className="flex items-center justify-between gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-sm"><button aria-label="Previous month" onClick={() => goToMonth(month.previous)} className="grid size-9 place-items-center rounded-xl hover:bg-secondary"><ArrowLeft className="size-4" /></button><button onClick={() => goToMonth(format(new Date(), "yyyy-MM"))} className="min-w-36 px-2 text-sm font-bold"><CalendarDays className="mr-2 inline size-4 text-primary" />{month.label}</button><button aria-label="Next month" onClick={() => goToMonth(month.next)} className="grid size-9 place-items-center rounded-xl hover:bg-secondary"><ArrowRight className="size-4" /></button></div>
        </section>

        <section className="mb-6">
          <SummaryCarousel
            items={[
              { key: "you-owe", label: "You owe this month", node: <SummaryCard label="You owe this month" value={summary.youOwe} currency={currency} icon={ArrowUpIcon} tone="peach" detail={`${formatMoney(summary.allTimeYouOwe, currency)} open overall`} onDetailClick={() => showLedger("OPEN", true)} /> },
              { key: "owed-to-you", label: "Owed to you this month", node: <SummaryCard label="Owed to you this month" value={summary.owedToYou} currency={currency} icon={ArrowDownLeft} tone="green" detail={`${formatMoney(summary.allTimeOwedToYou, currency)} open overall`} onDetailClick={() => showLedger("OPEN", true)} /> },
              { key: "you-paid", label: "You paid this month", node: <SummaryCard label="You paid this month" value={summary.paidByYou} currency={currency} icon={CheckCircle2} tone="blue" detail="Payments completed" /> },
              { key: "paid-to-you", label: "Paid back to you", node: <SummaryCard label="Paid back to you" value={summary.paidToYou} currency={currency} icon={WalletCards} tone="gold" detail="Money returned" /> },
            ]}
          />
        </section>

        <section className="mb-6 grid gap-6 xl:grid-cols-[1.55fr_.85fr]">
          <Card className="overflow-hidden"><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Monthly movement</CardTitle><p className="mt-1 text-sm text-muted-foreground">Daily borrowing and lending in {month.label}</p></div><div className="hidden gap-4 text-xs font-semibold sm:flex"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#df825f]" />Borrowed</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-primary" />Lent</span></div></CardHeader><CardContent className="h-64 pl-0 sm:h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}><defs><linearGradient id="borrowed" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#df825f" stopOpacity={0.25}/><stop offset="95%" stopColor="#df825f" stopOpacity={0}/></linearGradient><linearGradient id="lent" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#315f46" stopOpacity={0.22}/><stop offset="95%" stopColor="#315f46" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 7" vertical={false} stroke="#e7e6df"/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#898b82", fontSize: 11 }} interval={4}/><Tooltip formatter={(value) => formatMoney(Number(value), currency)} labelFormatter={(day) => `${month.label.split(" ")[0]} ${day}`} contentStyle={{ borderRadius: 14, border: "1px solid #e7e6df", boxShadow: "0 12px 30px rgba(0,0,0,.07)" }}/><Area type="monotone" dataKey="borrowed" stroke="#df825f" strokeWidth={2.5} fill="url(#borrowed)"/><Area type="monotone" dataKey="lent" stroke="#315f46" strokeWidth={2.5} fill="url(#lent)"/></AreaChart></ResponsiveContainer></CardContent></Card>
          <BalanceCard currentUser={currentUser} partner={partner} summary={summary} currency={currency} />
        </section>

        <LedgerCard
          mode={ledgerMode}
          month={month}
          monthlyDebts={debts}
          openDebts={openDebts}
          openDebtCount={openDebtCount}
          currentUser={currentUser}
          currency={currency}
          summary={summary}
          pending={pending}
          canAdd={Boolean(partner)}
          onModeChange={showLedger}
          onAdd={openEntry}
          run={run}
        />
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-5 py-3 backdrop-blur md:hidden"><div className="mx-auto flex max-w-sm items-center justify-around"><button className="flex flex-col items-center gap-1 text-[11px] font-bold text-primary"><Home className="size-5" />Home</button><button disabled={!partner} onClick={openEntry} className="-mt-8 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg disabled:opacity-50"><Plus className="size-6" /></button><button onClick={() => setSettingsOpen(true)} className="flex flex-col items-center gap-1 text-[11px] font-bold text-muted-foreground"><Settings2 className="size-5" />Settings</button></div></div>

      {partner && <EntryModal key={entrySession} open={entryOpen} currentUser={currentUser} partner={partner} currency={currency} categories={categories} pending={pending} onClose={() => setEntryOpen(false)} onSubmit={(input) => run(async () => { const result = await createDebt(input); if (result.ok) setEntryOpen(false); return result; })} />}
      {settingsOpen && <SettingsPanel currentUser={currentUser} household={household} members={members} categories={categories} pending={pending} onClose={() => setSettingsOpen(false)} run={run} />}
    </div>
  );
}

function ArrowUpIcon(props: React.ComponentProps<typeof ArrowDownRight>) { return <ArrowDownRight {...props} className={`${props.className ?? ""} rotate-180`} />; }

function SummaryCard({ label, value, currency, icon: Icon, tone, detail, onDetailClick }: { label: string; value: number; currency: string; icon: React.ElementType; tone: string; detail: string; onDetailClick?: () => void }) {
  const tones: Record<string, string> = { peach: "bg-[#f8e4da] text-[#9e4f37]", green: "bg-[#dcebdc] text-primary", blue: "bg-[#dfeaec] text-[#37616c]", gold: "bg-[#f5e9c9] text-[#80621f]" };
  return <Card className="h-full p-5"><div className="mb-5 flex items-start justify-between"><div className={`grid size-10 place-items-center rounded-2xl ${tones[tone]}`}><Icon className="size-5" /></div><Ellipsis className="size-5 text-muted-foreground/60" /></div><p className="text-sm font-semibold text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">{formatMoney(value, currency)}</p>{onDetailClick ? <button type="button" onClick={onDetailClick} className="mt-3 text-left text-xs font-bold text-primary hover:underline">{detail} · View all unpaid</button> : <p className="mt-3 text-xs font-medium text-muted-foreground">{detail}</p>}</Card>;
}

function LedgerCard({ mode, month, monthlyDebts, openDebts, openDebtCount, currentUser, currency, summary, pending, canAdd, onModeChange, onAdd, run }: {
  mode: LedgerMode;
  month: Props["month"];
  monthlyDebts: Debt[];
  openDebts: Debt[];
  openDebtCount: number;
  currentUser: Member;
  currency: string;
  summary: Props["summary"];
  pending: boolean;
  canAdd: boolean;
  onModeChange: (mode: LedgerMode) => void;
  onAdd: () => void;
  run: (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LedgerStatusFilter>("ALL");
  const [direction, setDirection] = useState<DirectionFilter>("ALL");
  const entries = mode === "OPEN" ? openDebts : monthlyDebts;

  const filtered = useMemo(() => filterLedgerEntries(entries, {
    mode, status, direction, currentUserId: currentUser.id, search,
  }), [currentUser.id, direction, entries, mode, search, status]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Debt[]>();
    filtered.forEach((debt) => {
      const key = format(new Date(debt.incurredAt), "yyyy-MM-dd");
      groups.set(key, [...(groups.get(key) ?? []), debt]);
    });
    return [...groups.entries()];
  }, [filtered]);

  const directionOptions: { value: DirectionFilter; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "YOU_OWE", label: "You owe" },
    { value: "OWED_TO_YOU", label: "Owed to you" },
  ];

  return (
    <Card id="ledger" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="gap-5 border-b border-border/70">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <CardTitle>{mode === "OPEN" ? "All unpaid" : "Monthly ledger"}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "OPEN"
                ? `${openDebtCount} ${openDebtCount === 1 ? "entry" : "entries"} still open across all months`
                : `${monthlyDebts.length} ${monthlyDebts.length === 1 ? "entry" : "entries"} recorded in ${month.label}`}
            </p>
          </div>
          <div role="group" aria-label="Ledger view" className="grid grid-cols-2 rounded-xl bg-secondary/80 p-1">
            <button
              type="button"
              aria-pressed={mode === "MONTH"}
              onClick={() => onModeChange("MONTH")}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition sm:px-4 ${mode === "MONTH" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              This month
            </button>
            <button
              type="button"
              aria-pressed={mode === "OPEN"}
              onClick={() => onModeChange("OPEN")}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition sm:px-4 ${mode === "OPEN" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              All unpaid <span className="rounded-full bg-[#f8e4da] px-1.5 py-0.5 text-[10px] text-[#9e4f37]">{openDebtCount}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {mode === "OPEN" ? (
            <div role="group" aria-label="Unpaid direction" className="flex flex-wrap gap-1.5">
              {directionOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={direction === option.value}
                  onClick={() => setDirection(option.value)}
                  className={`rounded-full border px-3 py-2 text-xs font-bold transition ${direction === option.value ? "border-primary/30 bg-[#eef4ed] text-primary" : "border-border bg-background text-muted-foreground hover:bg-secondary/60"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Entry status" className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-semibold outline-none">
              <option value="ALL">All statuses</option>
              <option value="DEBT">Debt</option>
              <option value="PAID">Paid</option>
            </select>
          )}
          <div className="relative min-w-0 flex-1 sm:max-w-72">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={mode === "OPEN" ? "Search unpaid entries" : "Search entries"} className="pl-9" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-5 sm:pt-6">
        {mode === "OPEN" && (
          <div className="mb-6 grid gap-2 rounded-2xl bg-[#244b37] p-3 text-white sm:grid-cols-2 sm:p-4">
            <div className="rounded-xl bg-white/7 px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-[.12em] text-white/55">You owe</p>
              <p className="mt-1 font-display text-xl font-semibold">{formatMoney(summary.allTimeYouOwe, currency)}</p>
            </div>
            <div className="rounded-xl bg-white/7 px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-[.12em] text-white/55">Owed to you</p>
              <p className="mt-1 font-display text-xl font-semibold text-[#f2d68d]">{formatMoney(summary.allTimeOwedToYou, currency)}</p>
            </div>
          </div>
        )}

        {grouped.length ? (
          <div className="space-y-7">
            {grouped.map(([date, dateEntries]) => (
              <div key={date}>
                <div className="mb-3 flex items-center gap-3">
                  <p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">
                    {format(new Date(`${date}T12:00:00`), mode === "OPEN" ? "EEEE, MMMM d, yyyy" : "EEEE, MMMM d")}
                  </p>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-2">
                  {dateEntries.map((debt) => <DebtRow key={debt.id} debt={debt} currentUser={currentUser} currency={currency} pending={pending} run={run} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyLedger mode={mode} hasEntries={entries.length > 0} onAdd={onAdd} canAdd={canAdd} />
        )}
      </CardContent>
    </Card>
  );
}

function BalanceCard({ currentUser, partner, summary, currency }: { currentUser: Member; partner?: Member; summary: Props["summary"]; currency: string }) {
  const net = summary.allTimeOwedToYou - summary.allTimeYouOwe;
  return <Card className="relative overflow-hidden bg-[#244b37] text-white"><div className="absolute -right-16 -top-16 size-52 rounded-full border-[36px] border-white/5"/><CardHeader><p className="text-xs font-bold uppercase tracking-[.18em] text-white/60">All-time balance</p><CardTitle className="text-white">Between you two</CardTitle></CardHeader><CardContent><div className="mb-6 flex items-center"><div className="grid size-12 place-items-center rounded-full border-2 border-white/40 bg-[#dcebdc] font-bold text-primary">{initials(currentUser.name)}</div><div className="mx-2 h-px flex-1 border-t border-dashed border-white/30"/><HandCoins className="size-5 text-[#f2d68d]"/><div className="mx-2 h-px flex-1 border-t border-dashed border-white/30"/><div className="grid size-12 place-items-center rounded-full border-2 border-white/40 bg-[#f4dfd5] font-bold text-[#9e4f37]">{partner ? initials(partner.name) : "?"}</div></div><p className="text-sm text-white/65">{!partner ? "Invite your partner to calculate your balance." : net > 0 ? `${partner.name.split(" ")[0]} owes you` : net < 0 ? `You owe ${partner.name.split(" ")[0]}` : "You’re perfectly even"}</p><p className="mt-1 font-display text-4xl font-semibold">{formatMoney(Math.abs(net), currency)}</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#f2d68d]" style={{ width: `${Math.min(100, Math.max(8, Math.abs(net) / Math.max(summary.allTimeOwedToYou + summary.allTimeYouOwe, 1) * 100))}%` }} /></div></CardContent></Card>;
}

function DebtRow({ debt, currentUser, currency, pending, run }: { debt: Debt; currentUser: Member; currency: string; pending: boolean; run: (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => void }) {
  const youBorrowed = debt.borrower.id === currentUser.id;
  return <div className="group flex items-center gap-3 rounded-2xl border border-transparent bg-secondary/45 p-3 transition hover:border-border hover:bg-card sm:gap-4 sm:p-4"><div className={`grid size-11 shrink-0 place-items-center rounded-2xl ${debt.paymentMethod === "CREDIT_CARD" ? "bg-[#e7e2f4] text-[#65548d]" : "bg-[#e1ebda] text-primary"}`}>{debt.paymentMethod === "CREDIT_CARD" ? <CreditCard className="size-5" /> : <Banknote className="size-5" />}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-semibold">{debt.itemName}</p><Badge className={debt.status === "PAID" ? "bg-[#dcebdc] text-primary" : "bg-[#f8e4da] text-[#9e4f37]"}>{debt.status === "PAID" ? "Paid" : "Debt"}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{debt.category} · {debt.paymentMethod === "CREDIT_CARD" ? "Credit card" : "Cash"} · {format(new Date(debt.incurredAt), "h:mm a")}</p>{debt.notes && <p className="mt-1 truncate text-xs italic text-muted-foreground/80">“{debt.notes}”</p>}</div><div className="text-right"><p className={`font-display text-base font-bold sm:text-lg ${youBorrowed ? "text-[#a6533b]" : "text-primary"}`}>{youBorrowed ? "−" : "+"}{formatMoney(debt.amount, currency)}</p><p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{debt.borrower.name.split(" ")[0]} owes {debt.lender.name.split(" ")[0]}</p></div><div className="flex shrink-0 gap-1"><button disabled={pending} aria-label={debt.status === "DEBT" ? "Mark paid" : "Mark unpaid"} onClick={() => run(() => setDebtStatus(debt.id, debt.status === "DEBT" ? "PAID" : "DEBT"))} className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-[#dcebdc] hover:text-primary"><Check className="size-4" /></button><button disabled={pending} aria-label="Delete entry" onClick={() => { if (window.confirm(`Delete “${debt.itemName}”?`)) run(() => deleteDebt(debt.id)); }} className="hidden size-9 place-items-center rounded-xl text-muted-foreground hover:bg-red-50 hover:text-red-600 sm:grid"><Trash2 className="size-4" /></button></div></div>;
}

function SettingsPanel({ currentUser, household, members, categories, pending, onClose, run }: { currentUser: Member; household: Props["household"]; members: Member[]; categories: CategoryOption[]; pending: boolean; onClose: () => void; run: (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => void }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const partner = members.find((m) => m.id !== currentUser.id);
  function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); run(() => updateHousehold({ name: String(data.get("name")), currency: String(data.get("currency")) })); }
  async function copy() { await navigator.clipboard.writeText(household.inviteCode); setCopied(true); toast.success("Invite code copied"); setTimeout(() => setCopied(false), 1600); }
  return (
    <div className="fixed inset-0 z-50 bg-[#10251b]/40 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="ml-auto flex h-full w-full max-w-lg flex-col overflow-y-auto bg-card p-6 shadow-2xl sm:p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Your space</p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Household settings</h2>
          </div>
          <button aria-label="Close settings" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-secondary">
            <X className="size-5" />
          </button>
        </div>

        <section className="mb-8 rounded-3xl bg-[#eef4ed] p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-full bg-[#dcebdc] font-bold text-primary">{initials(currentUser.name)}</div>
            <div className="min-w-0"><p className="font-semibold">{currentUser.name}</p><p className="truncate text-xs text-muted-foreground">{currentUser.email}</p></div>
          </div>
          {partner ? (
            <div className="flex items-center gap-3 border-t border-primary/10 pt-4">
              <div className="grid size-11 place-items-center rounded-full bg-[#f4dfd5] font-bold text-[#9e4f37]">{initials(partner.name)}</div>
              <div className="min-w-0"><p className="font-semibold">{partner.name}</p><p className="truncate text-xs text-muted-foreground">Partner · {partner.email}</p></div>
            </div>
          ) : <p className="border-t border-primary/10 pt-4 text-sm text-muted-foreground">Your partner hasn’t joined yet.</p>}
        </section>

        <form method="post" onSubmit={save} className="space-y-4">
          <Field label="Household name"><Input name="name" defaultValue={household.name} /></Field>
          <Field label="Currency">
            <Select name="currency" defaultValue={household.currency}>
              {["USD", "PHP", "CNY", "EUR", "GBP", "AUD", "CAD", "SGD"].map((currency) => <option key={currency}>{currency}</option>)}
            </Select>
          </Field>
          <Button disabled={pending} type="submit" className="w-full">Save household</Button>
        </form>

        <div className="my-8 h-px bg-border" />
        <CategorySettings categories={categories} pending={pending} onSave={(next) => run(() => updateCategoryConfig(next))} />

        <div className="my-8 h-px bg-border" />
        <section>
          <p className="font-semibold">Partner invite code</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Your partner creates their own account, then enters this code.</p>
          <button type="button" onClick={copy} className="mt-3 flex w-full items-center justify-between rounded-2xl border border-dashed border-primary/30 bg-[#eef4ed] px-4 py-4">
            <span className="font-mono text-lg font-bold tracking-[.18em] text-primary">{household.inviteCode}</span>
            <span className="text-xs font-bold text-primary">{copied ? "Copied!" : "Copy code"}</span>
          </button>
        </section>

        <div className="mt-auto pt-10">
          <Button variant="outline" className="w-full text-red-600" onClick={async () => { await authClient.signOut(); router.push("/login"); router.refresh(); }}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>
    </div>
  );
}

function InviteBanner({ household, pending, onJoin }: { household: Props["household"]; pending: boolean; onJoin: (code: string) => void }) {
  const [joining, setJoining] = useState(false); const [code, setCode] = useState("");
  return <div className="mb-7 rounded-3xl border border-[#d8c88e] bg-[#fff8df] p-5 sm:flex sm:items-center sm:justify-between"><div className="flex gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#f5e9c9] text-[#80621f]"><UserPlus className="size-5" /></div><div><p className="font-bold">Connect with your partner</p><p className="mt-1 text-sm leading-6 text-[#796d4d]">Share code <strong className="font-mono tracking-widest">{household.inviteCode}</strong>, or join the household they created.</p></div></div><div className="mt-4 sm:mt-0">{joining ? <div className="flex gap-2"><Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="INVITE CODE" className="w-36 bg-white uppercase"/><Button disabled={pending || !code} onClick={() => onJoin(code)}>Join</Button></div> : <Button variant="outline" onClick={() => setJoining(true)} className="bg-white">I have their code</Button>}</div></div>;
}

function EmptyLedger({ mode, hasEntries, onAdd, canAdd }: { mode: LedgerMode; hasEntries: boolean; onAdd: () => void; canAdd: boolean }) {
  const filteredEmpty = hasEntries;
  const title = filteredEmpty ? "No entries match those filters" : mode === "OPEN" ? "You’re all settled" : "Nothing recorded here yet";
  const description = filteredEmpty
    ? "Try another direction or search term."
    : mode === "OPEN"
      ? "There are no unpaid entries between you two."
      : canAdd ? "Add your first cash or credit-card purchase for this month." : "Invite your partner first, then you can start your shared ledger.";
  return <div className="grid place-items-center py-14 text-center"><div className="mb-4 grid size-14 place-items-center rounded-2xl bg-secondary text-primary">{mode === "OPEN" && !filteredEmpty ? <CheckCircle2 className="size-6" /> : <ReceiptText className="size-6" />}</div><h3 className="font-display text-lg font-semibold">{title}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>{mode === "MONTH" && !filteredEmpty && canAdd && <Button onClick={onAdd} className="mt-5"><Plus className="size-4" />Add first entry</Button>}</div>;
}
function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) { return <label className="block text-sm font-semibold">{label}{optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}<div className="mt-2">{children}</div></label>; }
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <div className="relative"><select {...props} className="h-11 w-full appearance-none rounded-xl border border-input bg-background px-3.5 pr-9 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10"/><ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/></div>; }
