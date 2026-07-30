/** @jsxImportSource react */
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef } from 'react';

export interface VirtualListProps {
  count: number;
  selected: number;
  /** Bumped by the island to request a scroll; the value is the row index. */
  scrollTo: number;
  onSelect?: (index: number) => void;
}

const ROW_HEIGHT = 32;
const VIEWPORT = 360;

/** Row labels are derived, not stored — see the README on why 10 000 rows don't belong in island state. */
const label = (index: number): string => `Row ${index.toLocaleString('en-US')}`;

export function VirtualList({ count, selected, scrollTo, onSelect }: VirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    // Without this the server has nothing to measure and renders zero rows.
    // With it, the first window is in the HTML before any JS runs.
    initialRect: { width: 480, height: VIEWPORT },
  });

  // The agent's `scrollToRow` intent lands here: island state asks, the
  // virtualizer obeys. A human scrollbar drag needs none of this.
  useEffect(() => {
    if (scrollTo >= 0) virtualizer.scrollToIndex(scrollTo, { align: 'start' });
  }, [scrollTo, virtualizer]);

  return (
    <div ref={parentRef} className="vlist" style={{ height: VIEWPORT, overflow: 'auto' }}>
      <div className="vlist-inner" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => (
          <button
            key={row.key}
            className={row.index === selected ? 'vrow vrow-selected' : 'vrow'}
            data-index={row.index}
            onClick={() => onSelect?.(row.index)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: row.size,
              transform: `translateY(${row.start}px)`,
            }}
          >
            {label(row.index)}
          </button>
        ))}
      </div>
    </div>
  );
}
