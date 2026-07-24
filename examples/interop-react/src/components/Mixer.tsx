/** @jsxImportSource react */
import { useState } from 'react';

export interface MixerProps {
  bands: { name: string; level: number }[];
  onBand?: (input: { name: string; level: number }) => void;
}

/** A plain React component (hooks and all) — Janux mounts it unchanged. */
export function Mixer({ bands, onBand }: MixerProps) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="mixer">
      {bands.map((band) => (
        <label key={band.name} className={active === band.name ? 'band band-active' : 'band'}>
          <span>
            {band.name}: {band.level}
          </span>
          <input
            type="range"
            min={0}
            max={10}
            value={band.level}
            onPointerDown={() => setActive(band.name)}
            onPointerUp={() => setActive(null)}
            onChange={(event) => onBand?.({ name: band.name, level: Number(event.target.value) })}
          />
        </label>
      ))}
    </div>
  );
}
