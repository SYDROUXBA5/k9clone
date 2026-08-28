// One number: how much of the bottom of the screen is already occupied by a pinned bar.
//
// The notification alert strip sits at the bottom of the content column while the support bubble and
// the field-help panel are position:fixed at the bottom corners — so without this they land on top of
// the strip's own buttons (found on merged main at 1280: the bubble covered NOTIFICATIONS). The strip
// measures itself and reports its height here; the floating pieces lift by that much.
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface BottomInsetApi {
  inset: number;
  report: (key: string, height: number) => void;
}
const BottomInsetContext = createContext<BottomInsetApi>({ inset: 0, report: () => {} });

export function BottomInsetProvider({ children }: { children: React.ReactNode }) {
  const [bars, setBars] = useState<Record<string, number>>({});
  const report = useCallback((key: string, height: number) => {
    setBars((prev) => {
      const next = Math.max(0, Math.round(height));
      if ((prev[key] ?? 0) === next) return prev;
      if (next === 0) {
        if (!(key in prev)) return prev;
        const { [key]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: next };
    });
  }, []);
  const inset = Object.values(bars).reduce((a, b) => Math.max(a, b), 0);
  const value = useMemo(() => ({ inset, report }), [inset, report]);
  return <BottomInsetContext.Provider value={value}>{children}</BottomInsetContext.Provider>;
}

/** Pixels of pinned bar at the bottom of the screen right now. */
export function useBottomInset(): number {
  return useContext(BottomInsetContext).inset;
}

/** Report (or clear, with 0) the height of a bar pinned to the bottom. */
export function useReportBottomInset(): (key: string, height: number) => void {
  return useContext(BottomInsetContext).report;
}
