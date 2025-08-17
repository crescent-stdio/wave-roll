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
    background: rgba(255, 255, 255, 0.8);
    padding: 4px 12px;
    border-radius: 8px;
    `;

  const label = document.createElement("span");
  label.textContent = "Show notes:";
  label.style.cssText = `font-weight:600;`;

  const select = document.createElement("select");
  select.style.cssText = `flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;`;

  const modes: HighlightMode[] = [
    "file",
    "highlight-simple",
    "highlight-blend",
    "highlight-exclusive",
    "eval-match-intersection-gray",
    "eval-match-intersection-own",
    "eval-exclusive-intersection-gray",
    "eval-exclusive-intersection-own",
    "eval-gt-missed-only",
  ];

  const descriptions: Record<HighlightMode, string> = {
    file: "Use the file's base color. No extra highlighting.",
    "highlight-simple":
      "Highlight overlapped segments with a brighter color; keep others as base color.",
    "highlight-blend":
      "Use additive blending so overlaps appear brighter where notes stack.",
    "highlight-exclusive":
      "Only highlight overlapped segments; non-overlap segments are shown in gray.",
    "eval-match-intersection-gray":
      "For matched ref/est notes, highlight the intersection segment; non-intersection and unmatched notes are gray.",
    "eval-match-intersection-own":
      "For matched ref/est notes, highlight the intersection segment; non-intersection and unmatched keep their file color.",
    "eval-exclusive-intersection-gray":
      "For matched ref/est notes, highlight only the non-overlap (exclusive) parts; intersection and unmatched are gray.",
    "eval-exclusive-intersection-own":
      "For matched ref/est notes, highlight only the non-overlap (exclusive) parts; intersection and unmatched keep their file color.",
    "eval-gt-missed-only":
      "Highlight only unmatched reference (ground-truth) notes; everything else is gray.",
  };

  modes.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    opt.title = descriptions[m] ?? "";
    select.appendChild(opt);
  });

  // Set initial value
  select.value = deps.stateManager.getState().visual.highlightMode;
  // Also expose description on hover over the select itself
  select.title = descriptions[select.value as HighlightMode] ?? "";

  select.addEventListener("change", () => {
    const mode = select.value as HighlightMode;

    // If an evaluation-based highlight mode is selected but no ref/est are set,
    // auto-populate them with the first two loaded files for immediate feedback.
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

    deps.stateManager.updateVisualState({
      highlightMode: mode,
    });
    // Keep tooltip in sync with selected mode
    select.title = descriptions[mode] ?? "";
  });

  group.append(label, select);
  return group;
}
