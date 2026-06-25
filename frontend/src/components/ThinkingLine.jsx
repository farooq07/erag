import { useEffect, useState } from "react";

const STEPS = [
  "Searching documents…",
  "Ranking passages…",
  "Generating answer…",
];

export default function ThinkingLine({ sources }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (sources?.length > 0) {
      setStep(2);
      return;
    }
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 900);
    return () => clearInterval(t);
  }, [sources]);

  return (
    <div className="flex items-center gap-2 text-[12px] text-faded">
      <span className="inline-flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1 h-1 rounded-full bg-indigo-400/60 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
      <span>{STEPS[step]}</span>
    </div>
  );
}
