import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FileText, Lock } from "lucide-react";

// Content mirrors the demo corpus that ships with DocuMind (demo/*.md).
const ROLES = [
  { id: "hr", label: "HR Manager", depts: ["HR", "General"] },
  { id: "fin", label: "Finance Director", depts: ["Finance", "Accounts", "General"] },
  { id: "it", label: "IT Lead", depts: ["IT", "General"] },
];

const QUESTIONS = [
  {
    id: "carry",
    q: "How many leave days can I carry over?",
    answer: [
      "You can carry over up to 5 unused annual leave days into the next year", 1,
      ". They must be used by 31 March or they're forfeited", 1,
      ". Directors can carry over up to 10 days with CEO approval", 1, ".",
    ],
    sources: [{
      n: 1, file: "HR_Leave_Policy.md", dept: "HR", where: "§5 Carry-over policy",
      passage: [
        "Employees may carry over ", ["a maximum of 5 unused annual leave days"],
        " into the following calendar year. Carried-over days must be used by ", ["31 March"],
        " or they are forfeited. Directors and above may carry over up to 10 days with CEO approval.",
      ],
    }],
  },
  {
    id: "revenue",
    q: "What was revenue in Q3 2024?",
    answer: [
      "Q3 2024 revenue was £18.4 million, up 14% on Q2's £16.1 million", 1,
      ". EBITDA rose to £4.2 million, a 22.8% margin", 1,
      ", and closing cash reached £11.3 million", 2, ".",
    ],
    sources: [
      {
        n: 1, file: "Finance_Q3_2024_Report.md", dept: "Finance", where: "Executive summary",
        passage: [
          "Acme Corp delivered strong Q3 2024 results with ", ["total revenue of £18.4 million"],
          ", a 14% increase over Q2 2024 (£16.1 million). ", ["EBITDA reached £4.2 million"], " (22.8% margin).",
        ],
      },
      {
        n: 2, file: "Finance_Q3_2024_Report.md", dept: "Finance", where: "Cash flow",
        passage: ["Opening cash balance (1 July 2024): £8.3 million. ", ["Closing cash balance (30 September 2024): £11.3 million"], "."],
      },
    ],
  },
  {
    id: "vpn",
    q: "Which VPN do I use when working remotely?",
    answer: [
      "Use the Zscaler VPN client; it's the only approved way to reach company systems remotely", 1,
      ". Never use public Wi-Fi without it switched on", 1, ".",
    ],
    sources: [{
      n: 1, file: "IT_Security_Policy.md", dept: "IT", where: "§4 Remote access",
      passage: [
        "Remote access is permitted only via the ", ["approved Zscaler VPN client"],
        ". Employees must ", ["never access company resources over public Wi-Fi without VPN active"], ".",
      ],
    }],
  },
];

const REFUSAL = "I couldn't find this in the documents you can access.";

function tokenize(answer) {
  // Split text into words so the answer can stream; citation numbers stay atomic.
  const out = [];
  for (const part of answer) {
    if (typeof part === "number") out.push({ cite: part });
    else for (const w of part.match(/\S+\s*|\s+/g) || []) out.push({ text: w });
  }
  return out;
}

export default function HeroDemo() {
  const reduce = useReducedMotion();
  const [roleId, setRoleId] = useState("hr");
  const [qId, setQId] = useState("carry");
  const [shown, setShown] = useState(0);
  const [focusCite, setFocusCite] = useState(null);
  const timer = useRef(null);

  const role = ROLES.find((r) => r.id === roleId);
  const question = QUESTIONS.find((x) => x.id === qId);
  const allowed = question.sources.every((s) => role.depts.includes(s.dept));
  const tokens = allowed ? tokenize(question.answer) : tokenize([REFUSAL]);

  const [activeKey, setActiveKey] = useState(`${roleId}:${qId}`);
  const currentKey = `${roleId}:${qId}`;
  if (currentKey !== activeKey) {
    setActiveKey(currentKey);
    setShown(0);
    setFocusCite(null);
  }

  // Stream the answer word by word; restart whenever role or question changes.
  useEffect(() => {
    if (reduce) return;
    const len = tokens.length;
    timer.current = setInterval(() => {
      setShown((n) => {
        if (n >= len) { clearInterval(timer.current); return n; }
        return n + 1;
      });
    }, 38);
    return () => clearInterval(timer.current);
  }, [roleId, qId, reduce, tokens.length]);

  const effectiveShown = reduce ? tokens.length : shown;
  const streaming = !reduce && effectiveShown < tokens.length;
  // A source lights up once the stream reaches its first citation marker.
  const citedSoFar = new Set(tokens.slice(0, effectiveShown).filter((t) => t.cite).map((t) => t.cite));

  return (
    <div
      className="relative rounded-[22px] border p-5 sm:p-6"
      style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow)" }}
    >
      <Segmented
        label="Asking as"
        options={ROLES.map((r) => ({ id: r.id, label: r.label }))}
        value={roleId}
        onChange={setRoleId}
      />

      <div className="mt-4" role="radiogroup" aria-label="Example question">
        <div className="flex flex-wrap gap-2">
          {QUESTIONS.map((x) => {
            const on = x.id === qId;
            return (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setQId(x.id)}
                className="min-h-[36px] rounded-full border px-3.5 py-1.5 text-left text-[13.5px] leading-snug transition-[transform,background-color,color] duration-200 active:scale-[0.98]"
                style={on
                  ? { background: "var(--ink)", color: "var(--paper)", borderColor: "var(--ink)" }
                  : { borderColor: "var(--rule)", color: "var(--ink)" }}
              >
                {x.q}
              </button>
            );
          })}
        </div>
      </div>

      {/* Answer */}
      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--rule)" }}>
        <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
          Answer
        </div>
        <p
          className="mt-2 min-h-[5.5rem] text-[16.5px] leading-[1.6] sm:min-h-[4.9rem]"
          aria-live="polite"
          aria-busy={streaming}
        >
          {tokens.slice(0, effectiveShown).map((t, i) =>
            t.cite ? (
              <button
                key={i}
                type="button"
                className="mx-[1px] inline-flex h-[18px] min-w-[18px] -translate-y-[2px] items-center justify-center rounded-[5px] px-1 align-middle font-mono text-[10.5px] font-semibold"
                style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
                onMouseEnter={() => setFocusCite(t.cite)}
                onMouseLeave={() => setFocusCite(null)}
                onFocus={() => setFocusCite(t.cite)}
                onBlur={() => setFocusCite(null)}
                aria-label={`Source ${t.cite}`}
              >
                {t.cite}
              </button>
            ) : (
              <span key={i}>{t.text}</span>
            ),
          )}
          {streaming && <span className="caret" aria-hidden="true" />}
        </p>
      </div>

      {/* Sources */}
      <div className="mt-3 space-y-2.5">
        <AnimatePresence mode="popLayout" initial={false}>
          {question.sources.map((s, idx) => {
            const visible = role.depts.includes(s.dept);
            const lit = visible && citedSoFar.has(s.n) && (focusCite === null || focusCite === s.n);
            return (
              <motion.figure
                key={`${qId}-${s.n}`}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: focusCite && focusCite !== s.n ? 0.55 : 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.12 } }}
                transition={{ type: "spring", stiffness: 260, damping: 28, delay: reduce ? 0 : idx * 0.05 }}
                className="rounded-[14px] border px-3.5 py-3"
                style={{ borderColor: "var(--rule)", background: "var(--paper)" }}
              >
                <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" style={{ color: "var(--muted)" }}>
                  <span
                    className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] px-1 font-mono text-[10.5px] font-semibold"
                    style={visible
                      ? { background: "var(--accent)", color: "var(--accent-ink)" }
                      : { border: "1px solid var(--rule)" }}
                  >
                    {s.n}
                  </span>
                  <FileText size={13} aria-hidden="true" />
                  <span className="font-mono" style={{ color: "var(--ink)" }}>{s.file}</span>
                  <span aria-hidden="true">·</span>
                  <span>{s.where}</span>
                  <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px]">
                    {!visible && <Lock size={11} aria-hidden="true" />}
                    {visible ? s.dept : `Withheld · ${s.dept} only`}
                  </span>
                </figcaption>
                <blockquote className="mt-2 text-[14px] leading-[1.65]">
                  {visible ? (
                    s.passage.map((p, i) =>
                      Array.isArray(p)
                        ? <span key={i} className={`hl ${lit ? "is-lit" : ""}`}>{p[0]}</span>
                        : <span key={i}>{p}</span>,
                    )
                  ) : (
                    <RedactedPassage passage={s.passage} reduce={reduce} />
                  )}
                </blockquote>
              </motion.figure>
            );
          })}
        </AnimatePresence>
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: "var(--muted)" }}>
        {allowed
          ? "Hover a number to see the exact passage it came from."
          : `${role.label}s can't read ${question.sources[0].dept} documents, so those passages are never retrieved and the answer says so.`}
      </p>
    </div>
  );
}

function RedactedPassage({ passage, reduce }) {
  // Never put the withheld words in the page (they'd be selectable and searchable
  // under the bar); same-length filler keeps the bars' line breaks realistic.
  const text = passage
    .map((p) => (Array.isArray(p) ? p[0] : p))
    .join("")
    .replace(/\S/g, "x");
  // The clip animates on a block wrapper; the inline span inside draws one bar per line.
  return (
    <motion.span
      className="block"
      role="img"
      aria-label="Passage withheld: outside your departments"
      initial={reduce ? false : { clipPath: "inset(0 100% 0 0)" }}
      animate={{ clipPath: "inset(0 0% 0 0)" }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
    >
      <span aria-hidden="true" className="redacted">{text}</span>
    </motion.span>
  );
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="relative inline-flex rounded-full border p-1"
        style={{ borderColor: "var(--rule)", background: "var(--paper)" }}
      >
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.id)}
              className="relative min-h-[32px] rounded-full px-3 text-[13px] font-medium"
              style={{ color: on ? "var(--paper)" : "var(--ink)" }}
            >
              {on && (
                <motion.span
                  layoutId="role-pill"
                  className="absolute inset-0 rounded-full"
                  style={{ background: "var(--ink)" }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
