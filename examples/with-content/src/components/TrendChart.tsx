/** @jsxImportSource react */
import { useState } from 'react';

export interface TrendChartProps {
  label: string;
  points: number[];
}

const WIDTH = 320;
const HEIGHT = 96;

/** A plain React component, hooks and all — Janux mounts it unchanged. */
export function TrendChart({ label, points }: TrendChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const highest = Math.max(...points, 1);
  const step = points.length > 1 ? WIDTH / (points.length - 1) : WIDTH;
  const coordinates = points.map((value, index) => [index * step, HEIGHT - (value / highest) * HEIGHT] as const);

  return (
    <figure className="trend-figure">
      <svg className="trend" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${label} over time`}>
        <polyline points={coordinates.map(([x, y]) => `${x},${y}`).join(' ')} />
        {coordinates.map(([x, y], index) => (
          <circle
            key={index}
            cx={x}
            cy={y}
            r={hovered === index ? 5 : 3}
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>
      <figcaption>
        {label}: {hovered === null ? `${points.length} weeks` : `${points[hovered]} in week ${hovered + 1}`}
      </figcaption>
    </figure>
  );
}
