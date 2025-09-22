import { UIComponentDependencies } from "../../types";
import { HighlightMode } from "@/core/state/types";

/**
 * Build the “Highlight Mode” select menu.
 */
export function createHighlightModeGroup(
  deps: UIComponentDependencies
): HTMLDivElement {
  const group = document.createElement("div");
  group.style.cssText = `display:flex;
    align-items:center;
    gap:8px;
    font-size:12px;
    height: 48px;
    background: var(--panel-bg);
    padding: 4px 12px;
    border-radius: 8px;
    max-width: 100%;
    overflow: hidden;
    `;

  const label = document.createElement("span");
  label.textContent = "Show notes:";
  label.style.cssText = `font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;

  const select = document.createElement("select");
  select.style.cssText = `flex:1;min-width:0;padding:4px 6px;border:1px solid var(--ui-border);border-radius:6px;background:var(--surface);color:var(--text-primary);`;

  const modes: HighlightMode[] = [
    "file", // file colors (no highlight)
    "eval-match-intersection-own",
    "eval-match-intersection-gray",
    "eval-exclusive-intersection-own",
    "eval-exclusive-intersection-gray",
    "eval-gt-missed-only-own",
    "eval-gt-missed-only-gray",
    // Custom-only target modes (TP/FP/FN)
    "eval-tp-only-own",
    "eval-tp-only-gray",
    "eval-fp-only-own",
    "eval-fp-only-gray",
    "eval-fn-only-own",
    "eval-fn-only-gray",
  ];

  const descriptions: Record<HighlightMode, string> = {
    file: "Show each file in its own color (no evaluation highlight).",
    // Legacy non-evaluation highlight modes (hidden in UI)
    "highlight-simple":
      "Basic overlap highlight: overlapping segments are slightly brightened.",
    "highlight-blend":
      "Additive blend: overlapping segments keep file colors and use additive blending.",
    "highlight-exclusive":
      "Exclusive emphasis: non-overlapping segments are emphasized; overlaps are muted/neutral.",
    // Evaluation presets (detailed tooltips)
    "eval-match-intersection-gray":
      "Matched overlap is emphasized. Overlapping segments are shown in neutral gray.",
    "eval-match-intersection-own":
      "Matched overlap is emphasized. Overlapping segments keep their file colors.",
    "eval-exclusive-intersection-gray":
      "Exclusive (non-overlapping) parts are emphasized. Overlaps are shown in neutral gray.",
    "eval-exclusive-intersection-own":
      "Exclusive (non-overlapping) parts are emphasized. Overlaps keep their file colors.",
    "eval-gt-missed-only-own":
      "Reference missed only: matched overlap is highlighted; missed (REF-only) segments are shown in gray.",
    "eval-gt-missed-only-gray":
      "Reference missed only: matched overlap is shown in gray; missed (REF-only) segments keep the reference color.",
    // Performance analysis modes
    "eval-tp-only-own": "Highlight True Positive (TP) segments, mute others",
    "eval-tp-only-gray": "Mute True Positive (TP) segments, keep others normal",
    "eval-fp-only-own": "Highlight False Positive (FP) segments, mute others",
    "eval-fp-only-gray": "Mute False Positive (FP) segments, keep others normal",
    "eval-fn-only-own": "Highlight False Negative (FN) segments, mute others",
    "eval-fn-only-gray": "Mute False Negative (FN) segments, mute others",
  };;;

  // Short labels for compact select text; hover/tap shows detailed descriptions above
  const labels: Record<HighlightMode, string> = {
    file: "File colors",
    // Legacy non-evaluation modes (hidden)
    "highlight-simple": "Overlap highlight (simple)",
    "highlight-blend": "Overlap blend (additive)",
    "highlight-exclusive": "Exclusive highlight",
    "eval-match-intersection-gray": "Match (overlap gray)",
    "eval-match-intersection-own": "Match (overlap own)",
    "eval-exclusive-intersection-gray": "Exclusive (overlap gray)",
    "eval-exclusive-intersection-own": "Exclusive (overlap own)",
    "eval-gt-missed-only-own": "Ref missed only (match highlight)",
    "eval-gt-missed-only-gray": "Ref missed only (match gray)",
    "eval-tp-only-own": "Highlight True Positive (TP)",
    "eval-tp-only-gray": "Mute True Positive (TP)",
    "eval-fp-only-own": "Highlight False Positive (FP)",
    "eval-fp-only-gray": "Mute False Positive (FP)",
    "eval-fn-only-own": "Highlight False Negative (FN)",
    "eval-fn-only-gray": "Mute False Negative (FN)",
  };;;

  // Hidden modes (kept for backward-compat in state, but not shown in UI)
  const hiddenModes: Set<HighlightMode> = new Set([
    "eval-match-intersection-own",
    "eval-match-intersection-gray",
    "eval-exclusive-intersection-own",
    "eval-exclusive-intersection-gray",
    "highlight-simple",
    "highlight-blend",
    "highlight-exclusive",
  ]);

  function mapHiddenModeToFallback(mode: HighlightMode): HighlightMode {
    switch (mode) {
      case "file":
        return "file";
      case "eval-match-intersection-own":
        return "eval-tp-only-own";
      case "eval-match-intersection-gray":
        return "eval-tp-only-gray";
      case "eval-exclusive-intersection-own":
        return "eval-fn-only-own";
      case "eval-exclusive-intersection-gray":
        return "eval-fn-only-gray";
      default:
        return mode;
    }
  }

  function visibleModeOf(mode: HighlightMode): HighlightMode {
    return hiddenModes.has(mode) ? mapHiddenModeToFallback(mode) : mode;
  }

  // Build grouped options (Match/Exclusive are intentionally hidden)
  const grouped: Array<{ label: string; items: HighlightMode[] }> = [
    { label: "Basic", items: ["file"] },
    {
      label: "Performance analysis",
      items: [
        "eval-tp-only-own",
        "eval-tp-only-gray",
        "eval-fp-only-own",
        "eval-fp-only-gray",
        "eval-fn-only-own",
        "eval-fn-only-gray",
      ],
    },
    {
      label: "Reference missed only",
      items: ["eval-gt-missed-only-own", "eval-gt-missed-only-gray"],
    },
  ];;

  grouped.forEach((g) => {
    const og = document.createElement("optgroup");
    og.label = g.label;
    g.items.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = labels[m] ?? m;
      opt.title = descriptions[m] ?? "";
      og.appendChild(opt);
    });
    select.appendChild(og);
  });

  // Set initial value (fallback to visible mode if current is hidden)
  select.value = visibleModeOf(
    deps.stateManager.getState().visual.highlightMode
  );
  // Also expose description on hover over the select itself
  select.title = descriptions[select.value as HighlightMode] ?? "";

  // Helper: inline mobile-friendly tooltip (toast-style)
  group.style.position = group.style.position || "relative";
  const tip = document.createElement("div");
  // Default toast style; can be overridden by deps.uiOptions?.highlightToast?.style
  tip.style.cssText = `position:absolute;left:12px;right:12px;bottom:52px;z-index:50;padding:8px 10px;border:1px solid var(--ui-border);border-radius:8px;background:var(--surface);color:var(--text-primary);font-size:12px;box-shadow:var(--shadow-sm);display:none;`;
  group.appendChild(tip);
  let tipTimer: number | null = null;
  function showMobileTip(text: string): void {
    tip.textContent = text;
    tip.style.display = "block";
    if (tipTimer) {
      clearTimeout(tipTimer as any);
      tipTimer = null;
    }
    const opts = deps.uiOptions?.highlightToast;
    // Position
    const pos = opts?.position ?? 'bottom';
    if (pos === 'top') {
      tip.style.bottom = "";
      tip.style.top = "52px";
    } else {
      tip.style.top = "";
      tip.style.bottom = "52px";
    }
    // Inline style overrides
    const style = opts?.style;
    if (style) {
      Object.assign(tip.style, style);
    }
    // Duration
    const duration = Math.max(800, Math.min(8000, opts?.durationMs ?? 2600));
    tipTimer = setTimeout(() => {
      tip.style.display = "none";
      tipTimer = null;
    }, duration) as unknown as number;
  }

  // Helper: apply a mode to state/UI
  function applyMode(mode: HighlightMode): void {
    // Auto-populate REF/COMP if needed for eval modes
    if (mode.startsWith("eval-")) {
      const evalState = deps.stateManager.getState().evaluation;
      const files = deps.midiManager.getState().files;
      if (
        (!evalState.refId || evalState.estIds.length === 0) &&
        files.length >= 2
      ) {
        deps.stateManager.updateEvaluationState({
          refId: evalState.refId ?? files[0].id,
          estIds:
            evalState.estIds.length > 0 ? evalState.estIds : [files[1].id],
        });
      }
    }

    deps.stateManager.updateVisualState({ highlightMode: mode });
    select.value = mode;
    select.title = descriptions[mode] ?? "";
    // Show mobile-friendly tooltip on change
    showMobileTip(descriptions[mode] ?? "");
  }

  select.addEventListener("change", () => {
    const mode = select.value as HighlightMode;
    applyMode(mode);
  });
  // Also surface description on touchstart/focus for mobile users
  select.addEventListener("touchstart", () => {
    const mode = select.value as HighlightMode;
    showMobileTip(descriptions[mode] ?? "");
  });
  select.addEventListener("focus", () => {
    const mode = select.value as HighlightMode;
    showMobileTip(descriptions[mode] ?? "");
  });

  group.append(label, select);
  return group;
}
