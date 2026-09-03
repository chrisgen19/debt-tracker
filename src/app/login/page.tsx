import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ArrowDownRight, CheckCircle2, CreditCard, ReceiptText, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect("/dashboard");
  return (
    <main className="relative min-h-svh overflow-hidden bg-[#eef4ed]">
      <div className="absolute -left-32 top-1/3 size-96 rounded-full bg-[#d7e7d5] blur-3xl" /><div className="absolute -right-32 -top-32 size-[32rem] rounded-full bg-[#f7e8c6] blur-3xl" />
      <div className="relative mx-auto grid min-h-svh max-w-7xl items-center gap-12 px-5 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] pt-[calc(env(safe-area-inset-top)+2.5rem)] lg:grid-cols-[1.1fr_.9fr] lg:px-10">
        <section className="hidden max-w-xl lg:block">
          <div className="mb-14 flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground"><ArrowDownRight className="size-5" /></div><span className="font-display text-xl font-bold tracking-tight">Owewell</span></div>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/10 bg-white/65 px-3.5 py-2 text-xs font-bold text-primary"><Sparkles className="size-3.5" /> Money between two people, made simple</div>
          <h2 className="font-display text-6xl font-semibold leading-[1.02] tracking-[-.045em] text-[#183228]">Keep the love.<br />Lose the awkward math.</h2>
          <p className="mt-6 max-w-lg text-lg leading-8 text-[#5b6f64]">Track cash, card purchases, and repayments in one calm shared space—so both of you always know where things stand.</p>
          <div className="mt-10 grid grid-cols-3 gap-3">{[{ icon: ReceiptText, text: "Daily records" }, { icon: CreditCard, text: "Cash & cards" }, { icon: CheckCircle2, text: "Easy settling" }].map(({ icon: Icon, text }) => <div key={text} className="rounded-2xl border border-white/70 bg-white/55 p-4 text-sm font-semibold text-[#365246]"><Icon className="mb-3 size-5 text-primary" />{text}</div>)}</div>
        </section>
        <section className="flex flex-col items-center"><div className="mb-8 flex items-center gap-3 lg:hidden"><div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground"><ArrowDownRight className="size-5" /></div><span className="font-display text-xl font-bold">Owewell</span></div><AuthForm /><p className="mt-5 text-center text-xs text-[#6e7f76]">Your household ledger is only visible to its two members.</p></section>
      </div>
    </main>
  );
}
