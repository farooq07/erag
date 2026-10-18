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

function Typewriter({ text }) {
  const [length, setLength] = useState(0);

  useEffect(() => {
    if (length >= text.length) return;
    const id = setInterval(() => {
      setLength((l) => Math.min(l + 1, text.length));
    }, 24);
    return () => clearInterval(id);
  }, [text.length, length]);

  return <span className="think-shimmer font-medium">{text.slice(0, length)}</span>;
}

export default function ThinkingLine({ sources }) {
  const hasSources = Array.isArray(sources) && sources.length > 0;
  const [phase, setPhase] = useState(0);

  // Understanding → Searching after a short beat.
  useEffect(() => {
    const t = setTimeout(() => setPhase((p) => Math.max(p, 1)), 700);
    return () => clearTimeout(t);
  }, []);

  // Passages landed → Reading, then on to Composing.
  useEffect(() => {
    if (!hasSources) return;
    const t = setTimeout(() => setPhase((p) => Math.max(p, 3)), 950);
    return () => clearTimeout(t);
  }, [hasSources]);

  const effectivePhase = hasSources ? Math.max(phase, 2) : phase;

  const label =
    PHASES[effectivePhase] +
    (effectivePhase >= 2 && hasSources
      ? ` · ${sources.length} passage${sources.length > 1 ? "s" : ""}`
      : "");

  return (
    <span className="inline-flex items-baseline gap-1.5 text-[13.5px] leading-relaxed">
      {reduceMotion ? (
        <span className="think-shimmer font-medium">{label}</span>
      ) : (
        <Typewriter key={label} text={label} />
      )}
      <span className="cursor" />
    </span>
  );
}
