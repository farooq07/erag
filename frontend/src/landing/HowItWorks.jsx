import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { FileSpreadsheet, FileText, Presentation, ScanText, Search, ShieldCheck } from "lucide-react";

// The four steps are the actual pipeline order, so they're numbered.
const STEPS = [
  {
    title: "Add your documents",
    body: "Upload any office file, scans included. Each one is filed under a department.",
    Visual: UploadVisual,
  },
  {
    title: "Every passage gets filed",
    body: "Files are split into passages and indexed twice: by exact words and by meaning.",
    Visual: IndexVisual,
  },
  {
    title: "Questions search both ways",
    body: "Both indexes are searched, then a second model ranks the best passages. Only your departments are searched.",
    Visual: SearchVisual,
  },
  {
    title: "Answers cite their sources",
    body: "The answer uses only those passages, numbered to their sources. No source, no answer.",
    Visual: AnswerVisual,
  },
];

export default function HowItWorks() {
  const [active, setActive] = useState(0);

  return (
    <section id="how" aria-labelledby="how-title" className="mx-auto max-w-[1200px] px-4 py-24 sm:px-8 lg:py-32">
      <div className="max-w-[640px]">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em]" style={{ color: "var(--muted)" }}>How it works</p>
        <h2 id="how-title" className="font-display mt-3 text-[34px] font-semibold leading-[1.08] sm:text-[44px]">
          From a pile of files to an answer you can check.
        </h2>
      </div>

      <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-20">
        {/* Sticky visual (desktop) */}
        <div className="hidden lg:block">
          <div className="sticky top-28">
            <Panel>
              <AnimatePresence mode="wait">
                <StepVisual key={active} index={active} />
              </AnimatePresence>
            </Panel>
          </div>
        </div>

        <ol className="space-y-10 lg:space-y-0">
          {STEPS.map((s, i) => (
            <Step key={s.title} index={i} step={s} active={active === i} onActive={setActive} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function Step({ index, step, active, onActive }) {
  const ref = useRef(null);
  const inView = useInView(ref, { margin: "-45% 0px -45% 0px" });
  useEffect(() => { if (inView) onActive(index); }, [inView, index, onActive]);

  return (
    <li ref={ref} className="lg:flex lg:min-h-[70vh] lg:items-center">
      <div>
        <div className="lg:hidden"><Panel><StepVisual index={index} /></Panel></div>
        <div
          className="mt-6 flex min-w-0 items-baseline gap-4 transition-opacity duration-500 lg:mt-0"
          style={{ opacity: active ? 1 : 0.42 }}
        >
          <span className="font-mono text-[13px]" style={{ color: "var(--accent)" }} aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div>
            <h3 className="font-display text-[24px] font-semibold leading-tight sm:text-[28px]">{step.title}</h3>
            <p className="mt-3 max-w-[52ch] text-[16px] leading-[1.7]" style={{ color: "var(--muted)" }}>{step.body}</p>
          </div>
        </div>
      </div>
    </li>
  );
}

function Panel({ children }) {
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-[22px] border p-5 sm:p-8 lg:aspect-[5/4]"
      style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow)" }}
    >
      {children}
    </div>
  );
}

function StepVisual({ index }) {
  const reduce = useReducedMotion();
  const { Visual } = STEPS[index];
  return (
    <motion.div
      className="w-full"
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -10, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 160, damping: 24 }}
    >
      <Visual />
    </motion.div>
  );
}

const stagger = (i, reduce) => (reduce ? {} : {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring", stiffness: 200, damping: 24, delay: 0.08 + i * 0.07 },
});

function Chip({ children, className = "", style }) {
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-[12px] border px-3 py-2.5 text-[13.5px] ${className}`}
         style={{ borderColor: "var(--rule)", background: "var(--paper)", ...style }}>
      {children}
    </div>
  );
}

function UploadVisual() {
  const reduce = useReducedMotion();
  const files = [
    { Icon: FileText, name: "Employee_Handbook_2024.pdf", dept: "General", status: "Ready · 14 passages" },
    { Icon: FileSpreadsheet, name: "Q3_Revenue_by_Region.xlsx", dept: "Finance", status: "Ready · 212 rows" },
    { Icon: Presentation, name: "Security_Awareness.pptx", dept: "IT", status: "Ready · 18 slides" },
    { Icon: ScanText, name: "Signed_Supplier_MSA.pdf", dept: "Legal", status: "Indexing · OCR" },
  ];
  return (
    <div className="space-y-2.5">
      {files.map(({ Icon, name, dept, status }, i) => (
        <motion.div key={name} {...stagger(i, reduce)}>
          <Chip>
            <Icon size={16} aria-hidden="true" style={{ color: "var(--muted)" }} />
            <span className="min-w-0 break-all font-mono text-[12.5px]">{name}</span>
            <span className="ml-auto hidden font-mono text-[11px] sm:inline" style={{ color: "var(--muted)" }}>{dept}</span>
            <span className="font-mono text-[11px]" style={{ color: status.startsWith("Ready") ? "var(--ink)" : "var(--accent)" }}>
              {status}
            </span>
          </Chip>
        </motion.div>
      ))}
    </div>
  );
}

function IndexVisual() {
  const reduce = useReducedMotion();
  const passages = [
    ["§5 Carry-over", "Employees may carry over a maximum of 5 unused annual leave days…"],
    ["§6 Requests", "Submit via HR portal at least 5 working days in advance…"],
    ["§7 Overtime", "1.5× hourly rate for the first 10 hours/month, 2× thereafter…"],
  ];
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[11.5px]" style={{ color: "var(--muted)" }}>
        <span>HR_Leave_Policy.md</span><span>HR</span>
      </div>
      <div className="mt-3 space-y-2">
        {passages.map(([where, text], i) => (
          <motion.div key={where} {...stagger(i, reduce)}>
            <Chip className="items-start">
              <span className="w-[86px] flex-none font-mono text-[11px]" style={{ color: "var(--accent)" }}>{where}</span>
              <span className="min-w-0 flex-1 basis-[180px] text-[13px] leading-snug">{text}</span>
            </Chip>
          </motion.div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-[11px]" style={{ color: "var(--muted)" }}>
        <div className="rounded-[10px] border px-3 py-2" style={{ borderColor: "var(--rule)" }}>Word index · “HR-09”, “2×”</div>
        <div className="rounded-[10px] border px-3 py-2" style={{ borderColor: "var(--rule)" }}>Meaning index · “time off”</div>
      </div>
    </div>
  );
}

function SearchVisual() {
  const reduce = useReducedMotion();
  const ranked = [
    ["HR_Leave_Policy.md", "§5 Carry-over", 0.94],
    ["Company_Handbook.md", "§3 Benefits", 0.41],
    ["HR_Leave_Policy.md", "§1 Entitlement", 0.38],
  ];
  return (
    <div>
      <Chip>
        <Search size={15} aria-hidden="true" style={{ color: "var(--muted)" }} />
        <span className="text-[13.5px]">How many leave days can I carry over?</span>
      </Chip>
      <div className="mt-2 pl-3 font-mono text-[11.5px]" style={{ color: "var(--muted)" }}>
        → “maximum unused annual leave days carried over to next year”
      </div>
      <div className="mt-4 space-y-2">
        {ranked.map(([file, where, score], i) => (
          <motion.div key={file + where} {...stagger(i, reduce)}>
            <Chip>
              <span className="font-mono text-[12px]">{file}</span>
              <span className="text-[12px]" style={{ color: "var(--muted)" }}>{where}</span>
              <span className="ml-auto flex items-center gap-2">
                <span className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "var(--rule)" }}>
                  <motion.span
                    className="block h-full rounded-full"
                    style={{ background: i === 0 ? "var(--accent)" : "var(--muted)", originX: 0 }}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: score }}
                    transition={{ type: "spring", stiffness: 120, damping: 22, delay: 0.25 + i * 0.08 }}
                  />
                </span>
                <span className="w-8 text-right font-mono text-[11px] tabular-nums">{score.toFixed(2)}</span>
              </span>
            </Chip>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AnswerVisual() {
  const reduce = useReducedMotion();
  return (
    <div>
      <motion.p {...stagger(0, reduce)} className="text-[15.5px] leading-[1.65]">
        You can carry over up to <span className="hl is-lit">5 unused days</span>, which must be used by{" "}
        <span className="hl is-lit">31 March</span>
        <span className="mx-1 inline-flex h-[18px] min-w-[18px] -translate-y-[2px] items-center justify-center rounded-[5px] px-1 align-middle font-mono text-[10.5px] font-semibold"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>1</span>.
      </motion.p>
      <motion.div {...stagger(1, reduce)} className="mt-4">
        <Chip>
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] px-1 font-mono text-[10.5px] font-semibold"
                style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>1</span>
          <span className="font-mono text-[12px]">HR_Leave_Policy.md</span>
          <span className="text-[12px]" style={{ color: "var(--muted)" }}>§5 Carry-over policy</span>
        </Chip>
      </motion.div>
      <motion.div {...stagger(2, reduce)} className="mt-2.5 flex items-center gap-2 pl-1 text-[12.5px]" style={{ color: "var(--muted)" }}>
        <ShieldCheck size={14} aria-hidden="true" style={{ color: "var(--ink)" }} />
        Every sentence checked against the cited passage
      </motion.div>
    </div>
  );
}
