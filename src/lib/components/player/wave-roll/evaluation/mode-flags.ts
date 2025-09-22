export interface ModeFlags {
  useGrayGlobal: boolean;
  isExclusiveGlobal: boolean;
  isIntersectionOwn: boolean;
  isTpOnly: boolean;
  isFpOnly: boolean;
  isFnOnly: boolean;
  isOnlyMode: boolean;
  aggregationMode: "pair" | "or";
}

export function parseModeFlags(highlightMode: string, estCount: number): ModeFlags {
  const useGrayGlobal = highlightMode.includes("-gray");
  const isExclusiveGlobal = highlightMode.includes("exclusive");
  const isIntersectionOwn = highlightMode.includes("-own");
  const isTpOnly = highlightMode.startsWith("eval-tp-only-");
  const isFpOnly = highlightMode.startsWith("eval-fp-only-");
  const isFnOnly = highlightMode.startsWith("eval-fn-only-");
  const isOnlyMode = isTpOnly || isFpOnly || isFnOnly;
  const aggregationMode: "pair" | "or" = estCount <= 1 ? "pair" : "or";
  return {
    useGrayGlobal,
    isExclusiveGlobal,
    isIntersectionOwn,
    isTpOnly,
    isFpOnly,
    isFnOnly,
    isOnlyMode,
    aggregationMode,
  };
}


