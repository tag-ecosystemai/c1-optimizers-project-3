"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { AskEvent, AskSource } from "@/types/api";

/*
 * Agent chat (spec §8.2), grown from the landing page's runout/AskDemo: POST /api/ask streams Server-Sent Events
 * (session, tool_call, token, final, error), read with fetch + ReadableStream because EventSource can't POST.
 * Scope is the server's job: this component never sends a distributor or warehouse id.
 */

interface Turn {
  id: number;
  query: string;
  tools: { name: string; label: string; done: boolean }[];
  text: string;
  sources: AskSource[];
  status: "streaming" | "done" | "stopped" | "error";
  error?: string;
}

/**
 * @param starters    Starter prompts shown on an empty chat (spec §5.1.3, §5.2.4).
 * @param note        Scope note under the input, e.g. "I can only see your account's data."
 * @param incidentId  Incident to give the agent as context (sent as `incident_id` on every message).
 * @param placeholder Input placeholder.
 */
export function AskPanel({
  starters,
  note,
  incidentId,
  placeholder = "Ask about your orders, stock or incidents…",
}: {
  starters: string[];
  note?: string;
  incidentId?: number;
  placeholder?: string;
}) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const sessionId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const streaming = turns.at(-1)?.status === "streaming";

  // Auto-scroll while the reader is at the bottom; scrolling up to read pauses it.
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => () => abort.current?.abort(), []);

  const patch = (id: number, fn: (t: Turn) => Turn) => setTurns((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));

  function handle(id: number, e: AskEvent) {
    switch (e.event) {
      case "session":
        sessionId.current = e.data.session_id;
        break;
      case "tool_call":
        patch(id, (t) => {
          const exists = t.tools.some((x) => x.name === e.data.name);
          const tools = exists
            ? t.tools.map((x) => (x.name === e.data.name ? { ...x, done: x.done || e.data.status === "done" } : x))
            : [...t.tools, { name: e.data.name, label: e.data.label, done: e.data.status === "done" }];
          return { ...t, tools };
        });
        break;
      case "token":
        patch(id, (t) => ({ ...t, text: t.text + e.data.text }));
        break;
      case "final":
        patch(id, (t) => ({ ...t, text: t.text.trimEnd(), sources: e.data.sources, status: "done" }));
        break;
      case "error":
        patch(id, (t) => ({ ...t, status: "error", error: e.data.message }));
        break;
    }
  }

  async function ask(query: string, replaceId?: number) {
    query = query.trim();
    if (!query || streaming) return;
    const id = nextId.current++;
    const turn: Turn = { id, query, tools: [], text: "", sources: [], status: "streaming" };
    setTurns((ts) => (replaceId ? ts.map((t) => (t.id === replaceId ? turn : t)) : [...ts, turn]));
    setInput("");
    stick.current = true;
    const ctrl = new AbortController();
    abort.current = ctrl;

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ query, session_id: sessionId.current, ...(incidentId && { incident_id: incidentId }) }),
        signal: ctrl.signal,
      });
      if (res.status === 401) return router.push("/login");
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value.replace(/\r\n/g, "\n");
        let cut;
        while ((cut = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          let event = "message";
          let data = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (data) handle(id, { event, data: JSON.parse(data) } as AskEvent);
        }
      }
      // Stream ended without final or error: treat what arrived as the answer.
      patch(id, (t) => (t.status === "streaming" ? { ...t, status: t.text ? "done" : "error", error: t.text ? undefined : "The answer was cut off. Try again." } : t));
    } catch {
      if (ctrl.signal.aborted) patch(id, (t) => (t.status === "streaming" ? { ...t, status: "stopped" } : t));
      else patch(id, (t) => ({ ...t, status: "error", error: "Couldn't reach the agent. Check your connection and try again." }));
    } finally {
      if (abort.current === ctrl) abort.current = null;
    }
  }

  function newChat() {
    abort.current?.abort();
    sessionId.current = null;
    setTurns([]);
    setInput("");
    inputRef.current?.focus();
  }

  async function copy(t: Turn) {
    try {
      await navigator.clipboard.writeText(t.text);
      setCopied(t.id);
      setTimeout(() => setCopied((c) => (c === t.id ? null : c)), 1500);
    } catch {
      // Clipboard blocked (insecure origin or permission): nothing to do.
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(input);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(input);
    }
  };

  return (
    <section
      aria-label="Ask RunOut"
      className="flex h-[calc(100dvh-16rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-line bg-white lg:h-[calc(100dvh-14.5rem)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-2.5">
        <span className="truncate text-sm text-fg-2">{incidentId ? `Context: incident #${incidentId}` : "Ask RunOut"}</span>
        <button type="button" onClick={newChat} disabled={!turns.length} className={btn}>
          New chat
        </button>
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5"
        aria-live="polite"
        aria-busy={streaming}
      >
        {turns.length === 0 && (
          <div className="m-auto flex w-full max-w-xl flex-col items-center gap-4 text-center">
            <p className="text-sm text-muted">{incidentId ? `Ask anything about incident #${incidentId}.` : "Ask a question, or start with one of these."}</p>
            <ul className="flex w-full flex-col gap-2">
              {starters.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => ask(s)}
                    className="w-full cursor-pointer rounded-xl border border-line bg-white px-4 py-3 text-left text-sm text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {turns.map((t) => (
          <div key={t.id} className="flex flex-col gap-3">
            <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-surface px-4 py-2.5 text-[15px] whitespace-pre-wrap text-fg">{t.query}</p>

            <div className="flex max-w-full flex-col gap-3 sm:max-w-[90%]">
              {t.tools.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Agent steps">
                  {t.tools.map((tool) => (
                    <li key={tool.name} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[12.5px] text-fg-2">
                      {tool.done ? (
                        <span className="text-risk-low" aria-label="done">
                          ✓
                        </span>
                      ) : t.status === "streaming" ? (
                        <span className="size-3 animate-spin rounded-full motion-reduce:animate-none border-[1.5px] border-muted border-t-transparent" aria-label="running" />
                      ) : (
                        <span className="text-muted" aria-label="not finished">
                          –
                        </span>
                      )}
                      {tool.label}
                    </li>
                  ))}
                </ul>
              )}

              {t.status === "streaming" && !t.text && !t.tools.length && <p className="text-sm text-muted">Thinking…</p>}

              {t.text && (
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-fg">
                  {t.text}
                  {t.status === "streaming" && <span className="ml-0.5 inline-block h-4 w-[7px] translate-y-0.5 animate-pulse bg-fg/60 motion-reduce:animate-none" />}
                </p>
              )}

              {t.status === "stopped" && <p className="text-xs text-muted">Stopped.</p>}

              {t.status === "error" && (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50/50 px-4 py-3 text-sm text-fg">
                  <span className="flex-1">{t.error}</span>
                  <button type="button" onClick={() => ask(t.query, t.id)} disabled={streaming} className={btn}>
                    Retry
                  </button>
                </div>
              )}

              {t.status === "done" && (
                <div className="flex flex-wrap items-center gap-2">
                  {t.sources.map((s) =>
                    s.href ? (
                      <Link key={s.label} href={s.href} className={`${chip} hover:bg-surface`}>
                        {s.label} →
                      </Link>
                    ) : (
                      <span key={s.label} className={chip}>
                        {s.label}
                      </span>
                    ),
                  )}
                  <button type="button" onClick={() => copy(t)} className={`${btn} ml-auto`}>
                    {copied === t.id ? "Copied" : "Copy"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-1.5 border-t border-line-subtle p-3">
        <div className="flex items-end gap-2">
          <label htmlFor="ask-input" className="sr-only">
            Your question
          </label>
          <textarea
            id="ask-input"
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={streaming}
            placeholder={streaming ? "The agent is answering…" : placeholder}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-base text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-blue-500 disabled:bg-surface sm:text-[15px]"
          />
          {streaming ? (
            <button type="button" onClick={() => abort.current?.abort()} className={`${btnLg} border border-line bg-white text-fg hover:bg-surface`}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className={`${btnLg} bg-black-200 text-white hover:bg-black-400 disabled:opacity-40`}>
              Send
            </button>
          )}
        </div>
        {note && <p className="px-1 text-xs text-muted">{note}</p>}
      </form>
    </section>
  );
}

const btn =
  "inline-flex h-8 shrink-0 cursor-pointer items-center rounded-[10px] border border-white-800 bg-white px-2.5 text-xs text-black-400 hover:bg-white-300 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-40";
const btnLg = "inline-flex h-11 shrink-0 cursor-pointer items-center rounded-xl px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";
const chip = "inline-flex items-center rounded-full border border-line px-3 py-1 text-[12.5px] text-fg-2";
