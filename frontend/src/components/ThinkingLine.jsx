import { useState, useEffect } from "react";

// A single line of live status text — Claude-style — shown while the assistant
// is retrieving and before the first token lands. No card, no stepper: just one
// phrase at a time, typed out and shimmering, then replaced by the next phase.
// Phase progression is anchored to real stream signals (retrieved `sources`
// arriving flips us from "searching" to "reading"); the rest are short beats.
const PHASES = [
  "Understanding your question",
  "Searching the knowledge base",
  "Reading the passages",
  "Composing a grounded answer",
];

const reduceMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function ThinkingLine({ sources }) {
  const hasSources = Array.isArray(sources) && sources.length > 0;
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState("");

  // Understanding → Searching after a short beat.
  useEffect(() => {
    const t = setTimeout(() => setPhase((p) => Math.max(p, 1)), 700);
    return () => clearTimeout(t);
  }, []);

  // Passages landed → Reading, then on to Composing.
  useEffect(() => {
    if (!hasSources) return;
    setPhase((p) => Math.max(p, 2));
    const t = setTimeout(() => setPhase((p) => Math.max(p, 3)), 950);
    return () => clearTimeout(t);
  }, [hasSources]);

  const label =
    PHASES[phase] +
    (phase >= 2 && hasSources
      ? ` · ${sources.length} passage${sources.length > 1 ? "s" : ""}`
      : "");

  // Typewriter reveal of the current phrase.
  useEffect(() => {
    if (reduceMotion) { setTyped(label); return; }
    setTyped("");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTyped(label.slice(0, i));
      if (i >= label.length) clearInterval(id);
    }, 24);
    return () => clearInterval(id);
  }, [label]);

  return (
    <span className="inline-flex items-baseline gap-1.5 text-[13.5px] leading-relaxed">
      <span className="think-shimmer font-medium">{typed}</span>
      <span className="cursor" />
    </span>
  );
}
