"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(true);
        setPin("");
        inputRef.current?.focus();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <form
        onSubmit={submit}
        className={`w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-xl p-8 shadow-[0_0_60px_-15px_rgba(124,92,255,0.25)] ${
          error ? "shake" : ""
        }`}
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 h-10 w-10 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] shadow-[0_0_25px_rgba(79,209,197,0.5)]" />
          <h1 className="text-lg font-medium tracking-tight text-[var(--foreground)]">
            Gastos
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Ingresa tu PIN para continuar</p>
        </div>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-[var(--foreground)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30"
        />

        {error && (
          <p className="mt-3 text-center text-sm text-[var(--danger)]">PIN incorrecto</p>
        )}

        <button
          type="submit"
          disabled={loading || !pin}
          className="mt-5 w-full rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] py-3 text-sm font-medium text-black transition-opacity disabled:opacity-40"
        >
          {loading ? "Verificando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
