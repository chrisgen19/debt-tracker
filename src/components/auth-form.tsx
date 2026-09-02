"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const data = new FormData(event.currentTarget); const email = String(data.get("email")); const password = String(data.get("password"));
    const result = mode === "signup"
      ? await authClient.signUp.email({ email, password, name: String(data.get("name")), callbackURL: "/dashboard" })
      : await authClient.signIn.email({ email, password, callbackURL: "/dashboard" });
    setPending(false);
    if (result.error) { setError(result.error.message ?? "Something went wrong. Please try again."); return; }
    router.push("/dashboard"); router.refresh();
  }
  return (
    <div className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-[0_30px_80px_rgba(20,50,37,.12)] backdrop-blur sm:p-8">
      <div className="mb-7"><p className="mb-2 text-xs font-bold uppercase tracking-[.22em] text-primary">Private by design</p><h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">{mode === "login" ? "Welcome back" : "Create your home"}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{mode === "login" ? "Sign in to see what’s settled and what’s still open." : "Start your household, then invite your partner in one tap."}</p></div>
      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" && <label className="block text-sm font-semibold">Your name<Input name="name" autoComplete="name" required minLength={2} placeholder="Alex Morgan" className="mt-2" /></label>}
        <label className="block text-sm font-semibold">Email address<Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" className="mt-2" /></label>
        <label className="block text-sm font-semibold">Password<Input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} placeholder="At least 8 characters" className="mt-2" /></label>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">{error}</p>}
        <Button type="submit" size="lg" disabled={pending} className="w-full">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <>{mode === "login" ? "Sign in" : "Create account"}<ArrowRight className="size-4" /></>}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">{mode === "login" ? "New to Owewell?" : "Already have an account?"}{" "}<button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }} className="font-bold text-primary hover:underline">{mode === "login" ? "Create an account" : "Sign in"}</button></p>
    </div>
  );
}
