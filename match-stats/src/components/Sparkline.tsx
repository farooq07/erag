interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

/**
 * A tiny dependency-free SVG sparkline. Renders a smooth line plus a faint
 * area fill, auto-scaled to the data's own min/max with a little padding so a
 * flat line still sits mid-height.
 */
export default function Sparkline({
  data,
  color,
  width = 64,
  height = 16,
}: SparklineProps) {
  if (data.length < 2) {
    // Not enough history yet — draw a flat baseline.
    return (
      <svg width={width} height={height} className="overflow-visible">
        <line
          x1={0}
          y1={height - 1}
          x2={width}
          y2={height - 1}
          stroke={color}
          strokeOpacity={0.35}
          strokeWidth={1}
        />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 1.5;
  const usableH = height - pad * 2;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = pad + (1 - (v - min) / range) * usableH;
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${points[0][0].toFixed(1)},${height} ${line} ${points[points.length - 1][0].toFixed(1)},${height}`;
  const gradId = `sparkfill-${Math.round(min)}-${Math.round(max)}-${data.length}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
