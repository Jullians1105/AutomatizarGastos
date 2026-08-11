"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const GREETING: Message = {
  id: "greeting",
  role: "assistant",
  text: "Hola. Contame qué gastaste o ingresaste (ej. \"50 mil el almuerzo\"), o preguntame algo como \"¿cuánto gasté en comida este mes?\".",
};

const TEXTAREA_MAX_HEIGHT_PX = 240;

function uid() {
  return Math.random().toString(36).slice(2);
}

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    autoGrow(inputRef.current);
  }, [input]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { id: uid(), role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: text }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      const data = await res.json();
      const reply: Message = {
        id: uid(),
        role: "assistant",
        text: data.message ?? data.error ?? "Algo salió mal.",
      };
      setMessages((m) => [...m, reply]);
    } catch {
      setMessages((m) => [
        ...m,
        { id: uid(), role: "assistant", text: "No pude conectarme. Intenta de nuevo." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-[var(--border)]/70 bg-[var(--background)]/80 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-5 sm:py-4">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] shadow-[0_0_18px_rgba(79,209,197,0.5)]" />
          <div>
            <h1 className="text-sm font-medium leading-none text-[var(--foreground)]">Gastos</h1>
            <p className="mt-1 text-xs text-[var(--muted)]">Conectado a Notion</p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-5 sm:py-6">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`msg-in flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[80%] ${
                m.role === "user"
                  ? "bg-gradient-to-br from-[var(--accent-2)] to-[var(--accent-2)]/70 text-white rounded-br-sm"
                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] rounded-bl-sm"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="msg-in flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <span className="dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              <span className="dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              <span className="dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="border-t border-[var(--border)]/70 bg-[var(--background)]/80 px-4 pt-3 backdrop-blur-xl pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            placeholder="Escribe un gasto, ingreso o una pregunta…"
            style={{ maxHeight: TEXTAREA_MAX_HEIGHT_PX }}
            className="min-h-[4.5rem] flex-1 resize-none overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-base leading-relaxed text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-black transition-opacity active:opacity-70 disabled:opacity-30"
            aria-label="Enviar"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="M4 12L20 4L13 20L11 13L4 12Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </footer>
    </div>
  );
}
