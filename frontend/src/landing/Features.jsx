import { motion, useReducedMotion } from "motion/react";

// Hairline illustrations: 1px strokes in the ink colour, one accent detail each.
// Paths draw themselves in when the card scrolls into view.
const FEATURES = [
  { title: "Cited answers", body: "Every claim links to the exact page it came from.", Art: CiteArt },
  { title: "Permission-aware", body: "People only get answers from documents they can see.", Art: ShieldArt },
  { title: "Keyword + meaning search", body: "Finds form numbers and loose phrasing alike.", Art: SearchArt },
  { title: "No guessing", body: "If the documents don't say, it tells you so.", Art: EmptyArt },
  { title: "Any office file", body: "PDF, Word, Excel, PowerPoint, even scans.", Art: FilesArt },
  { title: "Runs on your servers", body: "Files, index and audit log stay with you.", Art: ServerArt },
];

// Dashed strokes fade in: animating pathLength would replace their dash pattern.
const fade = {
  hidden: { opacity: 0 },
  show: (i = 0) => ({ opacity: 1, transition: { duration: 0.6, delay: 0.1 + i * 0.12 } }),
};

const draw = {
  hidden: { pathLength: 0, opacity: 0 },
  show: (i = 0) => ({
    pathLength: 1,
    opacity: 1,
    transition: { pathLength: { duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.1 + i * 0.12 }, opacity: { duration: 0.01, delay: 0.1 + i * 0.12 } },
  }),
};

// One stroke. `accent` paints it orange; `i` staggers its draw order.
function L({ d, i = 0, accent, dash }) {
  return (
    <motion.path
      d={d}
      variants={dash ? fade : draw}
      custom={i}
      strokeDasharray={dash ? "2 3" : undefined}
      style={accent ? { stroke: "var(--accent)" } : undefined}
    />
  );
}

function Art({ children }) {
  const reduce = useReducedMotion();
  return (
    <motion.svg
      viewBox="0 0 160 100"
      className="h-auto w-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      initial={reduce ? false : "hidden"}
      whileInView="show"
      animate={reduce ? "show" : undefined}
      viewport={{ once: true, margin: "0px 0px -15% 0px" }}
    >
      {children}
    </motion.svg>
  );
}

const rect = (x, y, w, h, r = 3) =>
  `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;

function CiteArt() {
  return (
    <Art>
      <L d={rect(22, 14, 46, 64)} />
      <L d="M30 26H60M30 34H56M30 50H58M30 58H52M30 66H56" i={1} />
      <L d="M30 42H54" i={2} accent />
      <L d="M60 42C78 42 80 34 96 34" i={3} accent dash />
      <L d={rect(96, 22, 46, 30, 6)} i={3} />
      <L d="M104 32H130M104 40H122" i={4} />
      <L d={rect(130, 36, 8, 8, 2)} i={5} accent />
    </Art>
  );
}

function ShieldArt() {
  return (
    <Art>
      <L d={rect(20, 30, 28, 38)} dash />
      <L d={rect(112, 30, 28, 38)} dash />
      <L d="M26 40H42M26 46H38M118 40H134M118 46H130" i={1} />
      <L d="M80 16L102 24V46C102 62 92 74 80 82C68 74 58 62 58 46V24Z" i={1} />
      <L d="M70 48L77 55L91 40" i={3} accent />
      <L d={rect(120, 54, 12, 9, 2)} i={4} />
      <L d="M123 54V51A3 3 0 0 1 129 51V54" i={4} />
    </Art>
  );
}

function SearchArt() {
  return (
    <Art>
      <L d="M18 28H46M18 36H40M18 44H48" />
      <L d={circle(26, 66, 2) + circle(40, 60, 2) + circle(34, 78, 2) + circle(48, 74, 2)} i={1} />
      <L d="M28 66L38 60M36 77L46 74M41 62L47 72" i={1} />
      <L d="M52 36C66 36 72 46 84 48M52 70C66 70 72 56 84 52" i={2} dash />
      <L d={circle(102, 50, 16)} i={3} />
      <L d="M114 62L130 78" i={4} />
      <L d="M95 50H109" i={5} accent />
    </Art>
  );
}

function EmptyArt() {
  return (
    <Art>
      <L d={rect(40, 14, 48, 66)} dash />
      <L d={circle(104, 54, 18)} i={1} />
      <L d="M117 67L134 84" i={2} />
      <L d="M97 54H111" i={3} accent />
    </Art>
  );
}

function FilesArt() {
  return (
    <Art>
      <L d={rect(24, 22, 36, 48)} />
      <L d="M30 32H54M30 40H50M30 48H54M30 56H46" i={1} />
      <L d={rect(64, 18, 36, 48)} i={1} />
      <L d="M64 30H100M64 42H100M64 54H100M76 18V66M88 18V66" i={2} />
      <L d={rect(104, 26, 36, 48)} i={2} />
      <L d={rect(110, 34, 24, 16, 2)} i={3} />
      <L d="M110 58H130M110 64H122" i={3} />
      <L d="M24 84H140" i={4} accent />
    </Art>
  );
}

function ServerArt() {
  return (
    <Art>
      <L d={rect(28, 10, 104, 80, 8)} dash />
      <L d={rect(54, 26, 52, 14) + rect(54, 44, 52, 14) + rect(54, 62, 52, 14)} i={1} />
      <L d="M62 33H76M62 51H76M62 69H76" i={2} />
      <L d={circle(96, 33, 1.5) + circle(96, 51, 1.5)} i={3} />
      <L d={circle(96, 69, 1.5)} i={3} accent />
    </Art>
  );
}

const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "0px 0px -12% 0px" },
};

export default function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8 lg:py-28">
      <motion.div {...reveal} transition={{ type: "spring", stiffness: 110, damping: 22 }} className="max-w-[640px]">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em]" style={{ color: "var(--muted)" }}>What you get</p>
        <h2 id="features-title" className="font-display mt-3 text-[32px] font-semibold leading-[1.1] sm:text-[40px]">
          One place to ask. Answers you can check.
        </h2>
      </motion.div>
      <ul className="mt-12 grid gap-px overflow-hidden rounded-[22px] border sm:grid-cols-2 lg:grid-cols-3"
          style={{ borderColor: "var(--rule)", background: "var(--rule)" }}>
        {FEATURES.map(({ title, body, Art: Illustration }, i) => (
          <motion.li key={title} {...reveal} transition={{ type: "spring", stiffness: 110, damping: 22, delay: (i % 3) * 0.06 }}
                     className="group flex flex-col p-6 sm:p-8" style={{ background: "var(--surface)" }}>
            <div className="mx-auto w-full max-w-[220px] transition-transform duration-500 group-hover:-translate-y-1" style={{ color: "var(--ink)" }}>
              <Illustration />
            </div>
            <h3 className="font-display mt-6 text-[19px] font-semibold leading-snug">{title}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>{body}</p>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
