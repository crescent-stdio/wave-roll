export interface Range { start: number; end: number }

export function mergeRanges(ranges: Range[]): Range[] {
  if (ranges.length === 0) return ranges;
  ranges.sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  let cur: Range = { ...ranges[0] };
  for (let i = 1; i < ranges.length; i++) {
    const r = ranges[i];
    if (r.start <= cur.end) {
      cur.end = Math.max(cur.end, r.end);
    } else {
      out.push(cur);
      cur = { ...r };
    }
  }
  out.push(cur);
  return out;
}


