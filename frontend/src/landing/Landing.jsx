import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { MotionConfig, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowDown, ArrowRight, Sparkles } from "lucide-react";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./landing.css";
import HeroDemo from "./HeroDemo";
import HowItWorks from "./HowItWorks";

// Measured on the benchmark in eval/ (58 questions over 12 company documents).
// Update from eval/baseline.json when the pipeline changes.
const PROOF = [
  { value: "98%", label: "of answers contain every expected fact, across 58 policy, finance, IT, legal and operations questions" },
  { value: "100%", label: "of questions the documents don't answer get a plain “couldn't find this”, not a guess" },
  { value: "0", label: "passages returned from outside the asker's departments, across every scoped test" },
];

const SECURITY = [
  ["Runs on your servers", "Documents, the search index and the audit log stay on infrastructure you control. Only the few passages that match a question are sent to the language model, and you can run that model locally with Ollama."],
  ["Permissions enforced in search", "Each document belongs to a department. Restricted passages are filtered out before ranking, so they can't leak into an answer, a citation or a summary."],
  ["Sign in the way you already do", "Google and Microsoft Entra single sign-on, or email and password with account lockout. Restrict sign-in to your company's domain."],
  ["Sessions you can revoke", "Short-lived access tokens, rotating refresh tokens and one-click sign out of every device. A password change ends every other session."],
  ["Every action on the record", "Logins, uploads, edits, deletions and questions are written to an audit log you can query."],
];

const FORMATS = ["PDF", "Scanned PDF (OCR)", "Word", "Excel", "PowerPoint", "Markdown", "Plain text"];

function useSmoothScroll(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const lenis = new Lenis({ duration: 1.1, easing: (t) => 1 - Math.pow(1 - t, 4) });
    let frame = requestAnimationFrame(function raf(time) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    });
    // In-page links glide instead of jumping.
    const onClick = (e) => {
      const a = e.target.closest("a[href^='#']");
      if (!a) return;
      const el = document.querySelector(a.getAttribute("href"));
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: -72 });
      history.replaceState(null, "", a.getAttribute("href"));
    };
    document.addEventListener("click", onClick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", onClick);
      lenis.destroy();
    };
  }, [enabled]);
}

const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "0px 0px -12% 0px" },
  transition: { type: "spring", stiffness: 110, damping: 22 },
};

export default function Landing({ onSignIn }) {
  const reduce = useReducedMotion();
  useSmoothScroll(!reduce);

  useEffect(() => {
    document.title = "DocuMind — answers from your company's documents";
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="landing min-h-[100dvh]">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:px-3 focus:py-2"
           style={{ background: "var(--surface)" }}>
          Skip to content
        </a>
        <Nav onSignIn={onSignIn} />
        <main id="main">
          <Hero onSignIn={onSignIn} />
          <Problem />
          <HowItWorks />
          <Proof />
          <Security />
          <Closing onSignIn={onSignIn} />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-[8px]" style={{ background: "var(--ink)", color: "var(--paper)" }}>
        <Sparkles size={15} aria-hidden="true" />
      </span>
      <span className="font-display text-[18px] font-semibold">DocuMind</span>
    </span>
  );
}

function Nav({ onSignIn }) {
  const { scrollY } = useScroll();
  const border = useTransform(scrollY, [0, 40], [0, 1]);
  return (
    <header className="sticky top-0 z-40">
      <div className="backdrop-blur-md" style={{ background: "color-mix(in srgb, var(--paper) 82%, transparent)" }}>
        <nav aria-label="Main" className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 sm:px-8">
          <a href="#main" aria-label="DocuMind home"><Wordmark /></a>
          <div className="ml-6 hidden items-center gap-6 text-[14px] md:flex" style={{ color: "var(--muted)" }}>
            <a href="#how" className="transition-colors hover:text-[color:var(--ink)]">How it works</a>
            <a href="#proof" className="transition-colors hover:text-[color:var(--ink)]">Accuracy</a>
            <a href="#security" className="transition-colors hover:text-[color:var(--ink)]">Security</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onSignIn}
                    className="hidden min-h-[40px] rounded-full px-4 text-[14px] font-medium sm:inline-flex sm:items-center">
              Sign in
            </button>
            <PrimaryButton onClick={onSignIn}>Open DocuMind</PrimaryButton>
          </div>
        </nav>
        <motion.div className="h-px" style={{ background: "var(--rule)", opacity: border }} />
      </div>
    </header>
  );
}

function PrimaryButton({ children, onClick, large }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex items-center gap-2 rounded-full font-medium transition-transform duration-200 active:scale-[0.98] ${large ? "min-h-[52px] px-6 text-[15.5px]" : "min-h-[40px] px-4 text-[14px]"}`}
      style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
    >
      {children}
      <ArrowRight size={large ? 17 : 15} aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-0.5" />
    </button>
  );
}

function Hero({ onSignIn }) {
  return (
    <section aria-labelledby="hero-title" className="mx-auto max-w-[1200px] px-4 pb-20 pt-12 sm:px-8 lg:pb-28 lg:pt-20">
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-16">
        <motion.div {...reveal} className="lg:pt-6">
          <p className="font-mono text-[12px] uppercase tracking-[0.16em]" style={{ color: "var(--muted)" }}>
            Company knowledge, answered
          </p>
          <h1 id="hero-title" className="font-display mt-4 text-[40px] font-semibold leading-[1.02] sm:text-[54px] lg:text-[60px]" style={{ textWrap: "balance" }}>
            Answers from your documents, with the page they came from.
          </h1>
          <p className="mt-6 max-w-[48ch] text-[17px] leading-[1.7]" style={{ color: "var(--muted)" }}>
            DocuMind reads your policies, reports and contracts, then answers questions in plain language.
            Every claim points to its source, and each person only gets answers from documents they're allowed to see.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <PrimaryButton large onClick={onSignIn}>Open DocuMind</PrimaryButton>
            <a href="#how" className="inline-flex min-h-[52px] items-center gap-2 rounded-full border px-5 text-[15px] font-medium transition-colors"
               style={{ borderColor: "var(--rule)" }}>
              See how it works <ArrowDown size={15} aria-hidden="true" />
            </a>
          </div>
          <p className="mt-6 text-[13px]" style={{ color: "var(--muted)" }}>
            Self-hosted · Google &amp; Microsoft sign-in · Works with PDF, Word, Excel and PowerPoint
          </p>
        </motion.div>

        <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.1 }}>
          <HeroDemo />
        </motion.div>
      </div>
    </section>
  );
}

function Problem() {
  const asks = [
    ["“How many days can I carry over?”", "asked in a team chat, answered from memory, wrong by five days."],
    ["“Which VPN are we meant to use?”", "a ticket to IT that waits two days for a one-line answer."],
    ["“What did we report for Q3?”", "three versions of the deck, none of them clearly final."],
  ];
  return (
    <section aria-labelledby="problem-title" className="border-y" style={{ borderColor: "var(--rule)", background: "var(--surface)" }}>
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-20 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20 lg:py-28">
        <motion.div {...reveal}>
          <p className="font-mono text-[12px] uppercase tracking-[0.16em]" style={{ color: "var(--muted)" }}>Why it matters</p>
          <h2 id="problem-title" className="font-display mt-3 text-[32px] font-semibold leading-[1.1] sm:text-[40px]">
            The answer is already written down. Nobody can find it.
          </h2>
          <p className="mt-5 max-w-[46ch] text-[16.5px] leading-[1.7]" style={{ color: "var(--muted)" }}>
            Policies live in shared drives, numbers in reports, rules in contracts. So people ask a colleague,
            wait for a ticket, or guess. DocuMind gives the same question the same sourced answer, every time.
          </p>
        </motion.div>
        <ul className="divide-y self-center" style={{ borderColor: "var(--rule)" }}>
          {asks.map(([q, outcome], i) => (
            <motion.li key={q} {...reveal} transition={{ ...reveal.transition, delay: i * 0.06 }}
                       className="py-5 first:pt-0 last:pb-0" style={{ borderColor: "var(--rule)" }}>
              <p className="font-display text-[20px] font-medium leading-snug sm:text-[22px]">{q}</p>
              <p className="mt-1.5 text-[15.5px]" style={{ color: "var(--muted)" }}>Today: {outcome}</p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Proof() {
  return (
    <section id="proof" aria-labelledby="proof-title" className="border-y" style={{ borderColor: "var(--rule)", background: "var(--surface)" }}>
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8 lg:py-28">
        <motion.div {...reveal} className="max-w-[640px]">
          <p className="font-mono text-[12px] uppercase tracking-[0.16em]" style={{ color: "var(--muted)" }}>Accuracy</p>
          <h2 id="proof-title" className="font-display mt-3 text-[32px] font-semibold leading-[1.1] sm:text-[40px]">
            Measured on every change, not promised.
          </h2>
          <p className="mt-5 text-[16.5px] leading-[1.7]" style={{ color: "var(--muted)" }}>
            DocuMind ships with a benchmark of real questions, including look-alike documents, follow-ups,
            questions it should refuse, and questions asked from the wrong department. Changes that make it worse don't ship.
          </p>
        </motion.div>
        <dl className="mt-14 grid gap-x-12 gap-y-10 border-t pt-10 md:grid-cols-[1.3fr_1fr_1fr]" style={{ borderColor: "var(--rule)" }}>
          {PROOF.map((p, i) => (
            <motion.div key={p.label} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }}>
              <dt className="sr-only">{p.label}</dt>
              <dd>
                <span className={`font-display block font-semibold leading-none tabular-nums ${i === 0 ? "text-[72px] sm:text-[88px]" : "text-[56px]"}`}>
                  {p.value}
                </span>
                <span className="mt-3 block max-w-[34ch] text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>{p.label}</span>
              </dd>
            </motion.div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Security() {
  return (
    <section id="security" aria-labelledby="security-title" className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8 lg:py-28">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <motion.div {...reveal} className="lg:sticky lg:top-28 lg:self-start">
          <p className="font-mono text-[12px] uppercase tracking-[0.16em]" style={{ color: "var(--muted)" }}>Security</p>
          <h2 id="security-title" className="font-display mt-3 text-[32px] font-semibold leading-[1.1] sm:text-[40px]">
            Built to pass the IT review.
          </h2>
          <p className="mt-5 max-w-[40ch] text-[16.5px] leading-[1.7]" style={{ color: "var(--muted)" }}>
            The questions your security team will ask, answered before the first meeting.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {FORMATS.map((f) => (
              <span key={f} className="rounded-full border px-3 py-1 font-mono text-[11.5px]" style={{ borderColor: "var(--rule)", color: "var(--muted)" }}>{f}</span>
            ))}
          </div>
        </motion.div>
        <dl className="divide-y border-y" style={{ borderColor: "var(--rule)" }}>
          {SECURITY.map(([title, body], i) => (
            <motion.div key={title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.04 }}
                        className="grid gap-2 py-7 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)] sm:gap-8" style={{ borderColor: "var(--rule)" }}>
              <dt className="font-display text-[19px] font-semibold leading-snug">{title}</dt>
              <dd className="text-[15.5px] leading-[1.7]" style={{ color: "var(--muted)" }}>{body}</dd>
            </motion.div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Closing({ onSignIn }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const width = useTransform(scrollYProgress, [0, 0.8], ["0%", "100%"]);
  return (
    <section ref={ref} aria-labelledby="closing-title" className="mx-auto max-w-[1200px] px-4 pb-24 sm:px-8 lg:pb-32">
      <div className="rounded-[28px] px-6 py-14 sm:px-12 sm:py-20" style={{ background: "var(--ink)", color: "var(--paper)" }}>
        <h2 id="closing-title" className="font-display max-w-[18ch] text-[34px] font-semibold leading-[1.06] sm:text-[52px]">
          Ask your documents{" "}
          <span className="relative inline-block">
            anything
            <motion.span aria-hidden="true" className="absolute -bottom-1 left-0 h-[6px] rounded-full"
                         style={{ width, background: "var(--accent)" }} />
          </span>
          . Check every answer.
        </h2>
        <p className="mt-6 max-w-[52ch] text-[16.5px] leading-[1.7]" style={{ opacity: 0.72 }}>
          Sign in with the demo accounts to try it on sample HR, finance, IT, legal and operations documents,
          or upload your own.
        </p>
        <div className="mt-9"><PrimaryButton large onClick={onSignIn}>Open DocuMind</PrimaryButton></div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t" style={{ borderColor: "var(--rule)" }}>
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-4 py-8 text-[13px] sm:px-8" style={{ color: "var(--muted)" }}>
        <Wordmark />
        <span className="ml-auto">Answers grounded in your own documents.</span>
      </div>
    </footer>
  );
}
