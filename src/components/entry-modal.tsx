"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, isSameDay, subDays } from "date-fns";
import {
  ArrowLeftRight, Banknote, CalendarDays, Check, CreditCard, HeartPulse, House, LoaderCircle,
  Plane, Plus, ReceiptText, Shapes, ShoppingBag, ShoppingBasket, StickyNote, UtensilsCrossed, X, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { currencySymbol, initials } from "@/lib/utils";

type Person = { id: string; name: string };
type Direction = "BORROWED" | "LENT";

type Props = {
  open: boolean;
  currentUser: Person;
  partner: Person;
  currency: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: Record<string, unknown>) => void;
};

/** Categories carry their own icon, tint and starter suggestions so picking one is a single tap. */
const CATEGORIES = [
  { name: "Food", icon: UtensilsCrossed, tint: "bg-[#f8e4da] text-[#9e4f37]", ideas: ["Dinner", "Lunch", "Coffee", "Merienda"] },
  { name: "Groceries", icon: ShoppingBasket, tint: "bg-[#dcebdc] text-[#315f46]", ideas: ["Groceries", "Market run", "Water gallon"] },
  { name: "Bills", icon: Zap, tint: "bg-[#f5e9c9] text-[#80621f]", ideas: ["Electricity", "Water", "Internet", "Rent"] },
  { name: "Shopping", icon: ShoppingBag, tint: "bg-[#e7e2f4] text-[#65548d]", ideas: ["Clothes", "Shoes", "Gadget"] },
  { name: "Travel", icon: Plane, tint: "bg-[#dfeaec] text-[#37616c]", ideas: ["Grab", "Gas", "Fare", "Hotel"] },
  { name: "Health", icon: HeartPulse, tint: "bg-[#f7dfe0] text-[#9b4a4f]", ideas: ["Medicine", "Check-up", "Vitamins"] },
  { name: "Home", icon: House, tint: "bg-[#e3e9d9] text-[#5b6b3a]", ideas: ["Repairs", "Furniture", "Cleaning"] },
  { name: "Other", icon: Shapes, tint: "bg-[#e7e6df] text-[#5f6259]", ideas: ["Gift", "Loan", "Misc"] },
] as const;

/** datetime-local wants a local wall-clock string, not the UTC that toISOString gives back. */
function toLocalInput(date: Date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

/** Keeps digits and at most one decimal point so the big amount field never rejects a keystroke. */
function sanitizeAmount(raw: string) {
  const [whole, ...rest] = raw.replace(/[^\d.]/g, "").split(".");
  return rest.length ? `${whole.slice(0, 9)}.${rest.join("").slice(0, 2)}` : whole.slice(0, 9);
}

export function EntryModal({ open, currentUser, partner, currency, pending, onClose, onSubmit }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [direction, setDirection] = useState<Direction>("BORROWED");
  const [amount, setAmount] = useState("");
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0].name);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CREDIT_CARD">("CREDIT_CARD");
  const [incurredAt, setIncurredAt] = useState(() => toLocalInput(new Date()));
  const [settled, setSettled] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);

  const symbol = useMemo(() => currencySymbol(currency), [currency]);
  const numericAmount = Number(amount || 0);
  const canSave = numericAmount > 0 && itemName.trim().length >= 2 && !pending;
  const active = CATEGORIES.find((entry) => entry.name === category) ?? CATEGORIES[0];

  // Drive the native dialog from the `open` prop. showModal() gives us the top layer,
  // focus trapping and Esc handling for free, and keeping the node mounted lets the
  // exit transition in globals.css actually run.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Safari has no `closedby`, so fall back to measuring the click against the dialog box.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if ("closedBy" in HTMLDialogElement.prototype) {
      dialog.setAttribute("closedby", "any");
      return;
    }
    const dismiss = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const inside =
        box.top <= event.clientY && event.clientY <= box.bottom &&
        box.left <= event.clientX && event.clientX <= box.right;
      if (!inside) dialog.close();
    };
    dialog.addEventListener("click", dismiss);
    return () => dialog.removeEventListener("click", dismiss);
  }, []);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    onSubmit({
      itemName: itemName.trim(),
      amount: numericAmount,
      category,
      paymentMethod,
      incurredAt,
      notes: notes.trim() || undefined,
      status: settled ? "PAID" : "DEBT",
      lenderId: direction === "BORROWED" ? partner.id : currentUser.id,
      borrowerId: direction === "BORROWED" ? currentUser.id : partner.id,
    });
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby="entry-title" className="sheet">
      <form
        onSubmit={submit}
        onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.currentTarget.requestSubmit(); }}
        className="sheet-panel flex max-h-[92svh] w-full min-w-0 flex-col overflow-hidden rounded-t-[2rem] bg-card text-left shadow-2xl sm:rounded-[2rem]"
      >
        <Hero
          currentUser={currentUser} partner={partner} direction={direction} onDirection={setDirection}
          amount={amount} onAmount={(value) => setAmount(sanitizeAmount(value))}
          symbol={symbol} settled={settled} onClose={onClose}
        />

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
          <section>
            <Legend>What was it?</Legend>
            <input
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
              placeholder={`${active.ideas[0]}…`}
              maxLength={100}
              className="h-12 w-full rounded-xl border border-input bg-background px-4 text-base font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {active.ideas.map((idea) => (
                <button
                  key={idea} type="button" onClick={() => setItemName(idea)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:bg-secondary hover:text-foreground"
                >
                  {idea}
                </button>
              ))}
            </div>
          </section>

          <section>
            <Legend>Category</Legend>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map(({ name, icon: Icon, tint }) => {
                const selected = name === category;
                return (
                  <button
                    key={name} type="button" onClick={() => setCategory(name)} aria-pressed={selected}
                    className={`flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border p-2 text-[11px] font-bold transition sm:p-2.5 ${selected ? "border-primary/40 bg-secondary/60 ring-2 ring-primary/10" : "border-transparent hover:bg-secondary/50"}`}
                  >
                    <span className={`grid size-9 place-items-center rounded-xl transition ${selected ? tint : "bg-secondary text-muted-foreground"}`}>
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="w-full truncate text-center">{name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="grid gap-6 sm:grid-cols-2">
            <section>
              <Legend>Paid with</Legend>
              <Segmented
                value={paymentMethod} onChange={setPaymentMethod}
                options={[
                  { value: "CREDIT_CARD" as const, label: "Card", icon: CreditCard },
                  { value: "CASH" as const, label: "Cash", icon: Banknote },
                ]}
              />
            </section>
            <section>
              <Legend>When</Legend>
              <WhenPicker value={incurredAt} onChange={setIncurredAt} />
            </section>
          </div>

          <section className="space-y-3">
            <button
              type="button" role="switch" aria-checked={settled} onClick={() => setSettled((value) => !value)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${settled ? "border-primary/40 bg-[#eef4ed]" : "border-border hover:bg-secondary/40"}`}
            >
              <span className={`grid size-6 shrink-0 place-items-center rounded-lg border transition ${settled ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}>
                {settled && <Check className="size-4" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">Already settled</span>
                <span className="block text-xs text-muted-foreground">Log it for the record without changing the balance</span>
              </span>
            </button>

            {notesOpen ? (
              <textarea
                autoFocus value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000}
                placeholder="Receipt number, who else was there, anything to remember…"
                className="min-h-20 w-full resize-none rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
              />
            ) : (
              <button type="button" onClick={() => setNotesOpen(true)} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-primary">
                <StickyNote className="size-4" />Add a note
                <Plus className="size-3.5" />
              </button>
            )}
          </section>
        </div>

        <footer className="flex items-center gap-3 border-t border-border bg-card px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7">
          <Button type="button" variant="ghost" size="lg" onClick={onClose} className="px-4">Cancel</Button>
          <Button type="submit" size="lg" disabled={!canSave} className="flex-1">
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <ReceiptText className="size-4" />}
            {pending ? "Saving" : "Save entry"}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}

function Hero({ currentUser, partner, direction, onDirection, amount, onAmount, symbol, settled, onClose }: {
  currentUser: Person; partner: Person; direction: Direction; onDirection: (value: Direction) => void;
  amount: string; onAmount: (value: string) => void; symbol: string; settled: boolean; onClose: () => void;
}) {
  const borrowed = direction === "BORROWED";
  const you = currentUser.name.split(" ")[0];
  const them = partner.name.split(" ")[0];
  const shown = Number(amount || 0) > 0 ? amount : "0";

  return (
    <div className="relative shrink-0 overflow-hidden bg-[#244b37] px-5 pb-6 pt-5 text-white sm:px-7">
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.18em] text-white/55">New entry</p>
          <h2 id="entry-title" className="mt-0.5 font-display text-xl font-semibold">Who borrowed?</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-white/10 transition hover:bg-white/20">
          <X className="size-4" />
        </button>
      </div>

      {/* Tapping either half flips the ledger direction; the pill slides to confirm it. */}
      <div className="relative mt-5 grid grid-cols-2 rounded-2xl bg-white/10 p-1">
        <span
          className="absolute inset-y-1 left-1 w-[calc(50%-.25rem)] rounded-xl bg-white shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: borrowed ? "translateX(0)" : "translateX(100%)" }}
          aria-hidden
        />
        {([["BORROWED", you, currentUser], ["LENT", them, partner]] as const).map(([value, label, person]) => (
          <button
            key={value} type="button" onClick={() => onDirection(value)} aria-pressed={direction === value}
            className={`relative z-10 flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-sm font-bold transition-colors ${direction === value ? "text-[#244b37]" : "text-white/70 hover:text-white"}`}
          >
            <span className={`grid size-6 place-items-center rounded-full text-[10px] font-black transition-colors ${direction === value ? "bg-[#dcebdc] text-[#244b37]" : "bg-white/15 text-white"}`}>
              {initials(person.name)}
            </span>
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* The rule sits on the wrapper, not the input, so it reads as a field at any digit count. */}
      <div className="relative mt-6 flex justify-center">
        <label className="flex min-w-36 cursor-text items-center justify-center gap-1 border-b-2 border-white/15 pb-1 transition-colors focus-within:border-[#f2d68d]">
          <span className={`font-display text-3xl font-semibold transition-colors ${Number(amount || 0) > 0 ? "text-white/70" : "text-white/30"}`}>{symbol}</span>
          <input
            autoFocus value={amount} onChange={(event) => onAmount(event.target.value)}
            inputMode="decimal" autoComplete="off" aria-label="Amount" placeholder="0"
            style={{ width: `${Math.max(shown.length, 1)}ch` }}
            className="min-w-[1ch] bg-transparent p-0 text-center font-display text-6xl font-semibold tabular-nums outline-none placeholder:text-white/25"
          />
        </label>
      </div>

      <p className="relative mt-3 flex items-center justify-center gap-1.5 text-center text-sm text-white/70">
        <ArrowLeftRight className="size-3.5 shrink-0 text-[#f2d68d]" aria-hidden />
        {settled
          ? "Settled on the spot, balance stays put"
          : borrowed ? <>You&rsquo;ll owe <strong className="font-semibold text-white">{them}</strong></> : <><strong className="font-semibold text-white">{them}</strong> will owe you</>}
      </p>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (value: T) => void; options: readonly { value: T; label: string; icon: React.ElementType }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(({ value: option, label, icon: Icon }) => (
        <button
          key={option} type="button" onClick={() => onChange(option)} aria-pressed={value === option}
          className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-bold transition ${value === option ? "border-primary/40 bg-[#eef4ed] text-primary ring-2 ring-primary/10" : "border-border text-muted-foreground hover:bg-secondary/50"}`}
        >
          <Icon className="size-4" />{label}
        </button>
      ))}
    </div>
  );
}

function WhenPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [custom, setCustom] = useState(false);
  const selected = new Date(value);
  const isToday = isSameDay(selected, new Date());
  const isYesterday = isSameDay(selected, subDays(new Date(), 1));

  function pick(daysAgo: number) {
    const now = new Date();
    const target = subDays(now, daysAgo);
    target.setHours(now.getHours(), now.getMinutes());
    onChange(toLocalInput(target));
    setCustom(false);
  }

  if (custom) {
    return (
      <input
        autoFocus type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-xl border border-input bg-background px-3.5 text-sm font-semibold outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
      />
    );
  }

  const options = [
    { label: "Today", active: isToday, onClick: () => pick(0) },
    { label: "Yesterday", active: isYesterday, onClick: () => pick(1) },
    { label: isToday || isYesterday ? "Pick" : format(selected, "MMM d"), active: !isToday && !isYesterday, onClick: () => setCustom(true) },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map(({ label, active, onClick }) => (
        <button
          key={label} type="button" onClick={onClick} aria-pressed={active}
          className={`flex h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-bold transition ${active ? "border-primary/40 bg-[#eef4ed] text-primary ring-2 ring-primary/10" : "border-border text-muted-foreground hover:bg-secondary/50"}`}
        >
          {label === "Pick" && <CalendarDays className="size-4" />}{label}
        </button>
      ))}
    </div>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-bold uppercase tracking-[.14em] text-muted-foreground">{children}</p>;
}
