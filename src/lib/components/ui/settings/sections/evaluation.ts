import { UIComponentDependencies } from "../../types";
import { precision_recall_f1_overlap } from "@/lib/evaluation/transcription/metrics";
import { ParsedMidi } from "@/lib/midi/types";

export function createEvaluationSection(
  deps: UIComponentDependencies
): HTMLDivElement {
  const section = document.createElement("div");
  section.style.cssText = "display:flex;flex-direction:column;gap:12px;";

  // Instant tooltip overlay for fast hover (Chrome-friendly)
  const tooltipEl = document.createElement("div");
  tooltipEl.style.cssText =
    "position:fixed;z-index:99999;pointer-events:none;background:rgba(33,37,41,0.95);color:#fff;padding:6px 8px;border-radius:6px;font-size:11px;line-height:1.2;max-width:320px;box-shadow:0 2px 8px rgba(0,0,0,0.25);transform:translate3d(0,0,0);display:none;white-space:pre-line;";
  document.body.appendChild(tooltipEl);
  let tooltipVisible = false;
  function positionTip(clientX: number, clientY: number) {
    const margin = 12;
    const { innerWidth, innerHeight } = window;
    tooltipEl.style.left = "0px";
    tooltipEl.style.top = "0px";
    const rect = tooltipEl.getBoundingClientRect();
    let x = clientX + margin;
    let y = clientY + margin;
    if (x + rect.width + margin > innerWidth) {
      x = Math.max(margin, clientX - rect.width - margin);
    }
    if (y + rect.height + margin > innerHeight) {
      y = Math.max(margin, clientY - rect.height - margin);
    }
    tooltipEl.style.transform = `translate(${x}px, ${y}px)`;
  }
  function showTip(text: string, clientX: number, clientY: number) {
    tooltipEl.textContent = text;
    tooltipEl.style.display = "block";
    tooltipVisible = true;
    positionTip(clientX, clientY);
  }
  function hideTip() {
    tooltipEl.style.display = "none";
    tooltipVisible = false;
  }
  function attachTip(el: HTMLElement, text: string) {
    el.setAttribute("data-tip", text);
    if (el.hasAttribute("title")) {
      el.removeAttribute("title");
    }
  }
  section.addEventListener("pointermove", (e) => {
    const target = e.target as HTMLElement | null;
    const tipHost = target
      ? (target.closest("[data-tip]") as HTMLElement | null)
      : null;
    if (tipHost) {
      const text = tipHost.getAttribute("data-tip");
      if (text) {
        if (!tooltipVisible || tooltipEl.textContent !== text) {
          showTip(
            text,
            (e as PointerEvent).clientX,
            (e as PointerEvent).clientY
          );
        } else {
          positionTip((e as PointerEvent).clientX, (e as PointerEvent).clientY);
        }
        return;
      }
    }
    if (tooltipVisible) {
      hideTip();
    }
  });
  section.addEventListener("pointerleave", () => {
    if (tooltipVisible) {
      hideTip();
    }
  });

  // Header
  const header = document.createElement("h3");
  header.textContent = "Evaluation: based on ";
  header.style.cssText = "margin:0;font-size:14px;font-weight:600;";

  const mirEval = "https://github.com/mir-evaluation/mir_eval";
  const mirEvalLink = document.createElement("a");
  mirEvalLink.href = mirEval;
  mirEvalLink.textContent = "mir_eval";
  mirEvalLink.style.cssText = "color:#007bff;text-decoration:underline;";
  mirEvalLink.target = "_blank";
  mirEvalLink.rel = "noopener noreferrer";
  header.appendChild(mirEvalLink);

  // Reference file select
  const refGroup = document.createElement("div");
  refGroup.style.cssText =
    "display:flex;align-items:center;gap:6px;font-size:12px;";
  attachTip(
    refGroup,
    "Select the ground-truth (reference) MIDI file to compare against."
  );

  const refLabel = document.createElement("span");
  refLabel.textContent = "Reference:";
  refLabel.style.cssText = "min-width:80px;font-weight:600;";

  const refSelect = document.createElement("select");
  refSelect.style.cssText =
    "flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;";
  attachTip(refSelect, "Choose the reference MIDI file (ground truth).");

  // Add empty option
  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.textContent = "(none)";
  emptyOpt.title = "No reference selected";
  refSelect.appendChild(emptyOpt);

  // Estimated files multi-select
  const estGroup = document.createElement("div");
  estGroup.style.cssText =
    "display:flex;align-items:start;gap:6px;font-size:12px;";
  attachTip(
    estGroup,
    "Select one or more estimated transcription files to evaluate against the reference."
  );

  const estLabel = document.createElement("span");
  estLabel.textContent = "Estimated:";
  estLabel.style.cssText = "min-width:80px;font-weight:600;padding-top:4px;";

  const estSelect = document.createElement("select");
  estSelect.multiple = true;
  estSelect.style.cssText =
    "flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;min-height:60px;";
  attachTip(
    estSelect,
    "Pick one or more estimated MIDI files produced by transcription systems."
  );

  // Tolerances inputs
  const tolerancesGroup = document.createElement("div");
  tolerancesGroup.style.cssText = "display:flex;flex-direction:column;gap:6px;";
  attachTip(
    tolerancesGroup,
    "Matching tolerances used to pair reference and estimated notes for metric computation."
  );

  const toleranceDescriptions: Record<
    | "onsetTolerance"
    | "pitchTolerance"
    | "offsetRatioTolerance"
    | "offsetMinTolerance",
    string
  > = {
    onsetTolerance:
      "Maximum allowed onset difference (in seconds) for a note to count as a match.",
    pitchTolerance:
      "Maximum allowed pitch difference (in semitones, MIDI notes) for a match.",
    offsetRatioTolerance:
      "Maximum allowed relative offset difference: |est_end - ref_end| / ref_duration. For example, 0.2 allows a 20% deviation.",
    offsetMinTolerance:
      "Minimum absolute offset tolerance (in seconds) to allow for very short notes.",
  };

  const createToleranceInput = (
    label: string,
    field:
      | "onsetTolerance"
      | "pitchTolerance"
      | "offsetRatioTolerance"
      | "offsetMinTolerance",
    step: string = "0.01"
  ) => {
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;gap:6px;font-size:12px;";
    attachTip(row, toleranceDescriptions[field]);

    const lbl = document.createElement("span");
    lbl.textContent = label;
    lbl.style.cssText = "min-width:120px;font-weight:600;";
    attachTip(lbl, toleranceDescriptions[field]);

    const input = document.createElement("input");
    input.type = "number";
    input.step = step;
    input.style.cssText =
      "flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;";
    input.value = String(deps.stateManager.getState().evaluation[field]);
    attachTip(input, toleranceDescriptions[field]);

    input.addEventListener("change", () => {
      deps.stateManager.updateEvaluationState({
        [field]: parseFloat(input.value),
      });
      updateMetrics();
    });

    row.append(lbl, input);
    return row;
  };

  tolerancesGroup.append(
    createToleranceInput("Onset tol (s):", "onsetTolerance", "0.001"),
    createToleranceInput("Pitch tol (MIDI):", "pitchTolerance", "0.1"),
    createToleranceInput("Offset ratio tol:", "offsetRatioTolerance", "0.01"),
    createToleranceInput("Offset min tol (s):", "offsetMinTolerance", "0.001")
  );

  // Anchor select (for future use)
  const anchorGroup = document.createElement("div");
  anchorGroup.style.cssText =
    "display:flex;align-items:center;gap:6px;font-size:12px;";
  attachTip(
    anchorGroup,
    "Select the time region used as the anchor for overlap/visualization."
  );

  const anchorLabel = document.createElement("span");
  anchorLabel.textContent = "Anchor:";
  anchorLabel.style.cssText = "min-width:80px;font-weight:600;";
  attachTip(
    anchorLabel,
    "Intersection: overlap only; \n Ref: reference span; \n Est: estimated span."
  );

  const anchorSelect = document.createElement("select");
  anchorSelect.style.cssText =
    "flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;";
  const anchorDescriptions: Record<"intersection" | "ref" | "est", string> = {
    intersection: "Use the overlapped region as the anchor for visualization.",
    ref: "Use the reference note span as the anchor.",
    est: "Use the estimated note span as the anchor.",
  };

  ["intersection", "ref", "est"].forEach((anchor) => {
    const opt = document.createElement("option");
    opt.value = anchor;
    opt.textContent = anchor;
    opt.title = anchorDescriptions[anchor as "intersection" | "ref" | "est"];
    anchorSelect.appendChild(opt);
  });

  anchorSelect.value = deps.stateManager.getState().evaluation.anchor;
  attachTip(
    anchorSelect,
    anchorDescriptions[anchorSelect.value as "intersection" | "ref" | "est"]
  );
  anchorSelect.addEventListener("change", () => {
    deps.stateManager.updateEvaluationState({
      anchor: anchorSelect.value as "intersection" | "ref" | "est",
    });
    attachTip(
      anchorSelect,
      anchorDescriptions[anchorSelect.value as "intersection" | "ref" | "est"]
    );
  });

  // K-of-N input (for future use)
  const kOfNGroup = document.createElement("div");
  kOfNGroup.style.cssText =
    "display:flex;align-items:center;gap:6px;font-size:12px;";
  attachTip(
    kOfNGroup,
    "Require at least K systems out of N to agree (reserved for future use)."
  );

  const kOfNLabel = document.createElement("span");
  kOfNLabel.textContent = "K-of-N:";
  kOfNLabel.style.cssText = "min-width:80px;font-weight:600;";
  attachTip(
    kOfNLabel,
    "Consensus threshold among multiple systems (not used yet)."
  );

  const kOfNInput = document.createElement("input");
  kOfNInput.type = "number";
  kOfNInput.min = "1";
  kOfNInput.step = "1";
  kOfNInput.style.cssText =
    "flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;";
  kOfNInput.value = String(deps.stateManager.getState().evaluation.kOfN);
  attachTip(
    kOfNInput,
    "Set K for K-of-N consensus across estimated systems (not used yet)."
  );

  kOfNInput.addEventListener("change", () => {
    deps.stateManager.updateEvaluationState({
      kOfN: parseInt(kOfNInput.value),
    });
  });

  // Metrics display
  const metricsBox = document.createElement("div");
  metricsBox.style.cssText =
    "border:1px solid #ced4da;border-radius:6px;padding:8px;background:#f8f9fa;font-size:11px;font-family:monospace;";
  attachTip(
    metricsBox,
    "Shows Precision, Recall, F1, and average overlap ratio for the selected files under current tolerances. Based on mir_eval.transcription."
  );

  const updateMetrics = () => {
    const state = deps.stateManager.getState().evaluation;
    const files = deps.midiManager.getState().files;

    metricsBox.innerHTML = "";

    if (!state.refId || state.estIds.length === 0) {
      metricsBox.textContent =
        "Select reference and estimated files to see metrics";
      return;
    }

    const refFile = files.find((f) => f.id === state.refId);
    if (!refFile) {
      metricsBox.textContent = "Reference file not found";
      return;
    }

    // Use the first estimated file for metrics display
    const estId = state.estIds[0];
    const estFile = files.find((f) => f.id === estId);

    if (!estFile) {
      metricsBox.textContent = "Estimated file not found";
      return;
    }

    // Check if parsed MIDI data exists
    if (!refFile.parsedData || !estFile.parsedData) {
      metricsBox.textContent = "MIDI data not loaded";
      return;
    }

    // Calculate metrics
    const metrics = precision_recall_f1_overlap(
      refFile.parsedData,
      estFile.parsedData,
      {
        onsetTolerance: state.onsetTolerance,
        pitchTolerance: state.pitchTolerance,
        offsetRatioTolerance: state.offsetRatioTolerance,
        offsetMinTolerance: state.offsetMinTolerance,
      }
    );

    // Display metrics
    const lines = [
      `File: ${estFile.displayName}`,
      `Precision: ${metrics.precision.toFixed(3)}`,
      `Recall: ${metrics.recall.toFixed(3)}`,
      `F1: ${metrics.f1.toFixed(3)}`,
      `Avg Overlap: ${metrics.avgOverlapRatio.toFixed(3)}`,
    ];

    metricsBox.innerHTML = lines.join("<br>");
  };

  // Update file selects when files change
  const updateFileOptions = () => {
    const files = deps.midiManager.getState().files;
    const state = deps.stateManager.getState().evaluation;

    // Clear and rebuild reference select
    refSelect.innerHTML = "";
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "(none)";
    refSelect.appendChild(emptyOpt);

    // Clear and rebuild estimated select
    estSelect.innerHTML = "";

    files.forEach((file) => {
      // Add to reference select
      const refOpt = document.createElement("option");
      refOpt.value = file.id;
      refOpt.textContent = file.displayName;
      refOpt.title = `Reference candidate: ${file.displayName}`;
      refSelect.appendChild(refOpt);

      // Add to estimated select
      const estOpt = document.createElement("option");
      estOpt.value = file.id;
      estOpt.textContent = file.displayName;
      estOpt.title = `Estimated candidate: ${file.displayName}`;
      estSelect.appendChild(estOpt);
    });

    // Auto-select first file as reference if no reference is set and files exist
    let newRefId = state.refId;
    if (!newRefId && files.length > 0) {
      newRefId = files[0].id;
      deps.stateManager.updateEvaluationState({
        refId: newRefId,
      });
    }

    // Auto-select second file as estimated if no estimated files are set and at least 2 files exist
    let newEstIds = state.estIds;
    if (newEstIds.length === 0 && files.length >= 2) {
      newEstIds = [files[1].id];
      deps.stateManager.updateEvaluationState({
        estIds: newEstIds,
      });
    }

    // Sync UI with current state (use new values if auto-selected)
    refSelect.value = newRefId || "";
    Array.from(estSelect.options).forEach((opt) => {
      opt.selected = newEstIds.includes(opt.value);
    });

    // Update titles like highlight-mode-group
    if (refSelect.value) {
      const sel = refSelect.selectedOptions[0];
      attachTip(
        refSelect,
        sel
          ? `Reference: ${sel.textContent}`
          : "Choose the reference MIDI file (ground truth)."
      );
    } else {
      attachTip(refSelect, "Choose the reference MIDI file (ground truth).");
    }

    const estSelectedLabels = Array.from(estSelect.selectedOptions)
      .map((o) => o.textContent || "")
      .filter(Boolean);
    if (estSelectedLabels.length > 0) {
      attachTip(
        estSelect,
        `Estimated (${estSelectedLabels.length}): ${estSelectedLabels.join(", ")}`
      );
    } else {
      attachTip(
        estSelect,
        "Pick one or more estimated MIDI files produced by transcription systems."
      );
    }

    updateMetrics();
  };

  // Event listeners
  refSelect.addEventListener("change", () => {
    deps.stateManager.updateEvaluationState({
      refId: refSelect.value || null,
    });
    // Keep tooltip in sync with selected option
    if (refSelect.value) {
      const sel = refSelect.selectedOptions[0];
      attachTip(
        refSelect,
        sel
          ? `Reference: ${sel.textContent}`
          : "Choose the reference MIDI file (ground truth)."
      );
    } else {
      attachTip(refSelect, "Choose the reference MIDI file (ground truth).");
    }
    updateMetrics();
  });

  estSelect.addEventListener("change", () => {
    const selected = Array.from(estSelect.selectedOptions).map((o) => o.value);
    deps.stateManager.updateEvaluationState({
      estIds: selected,
    });
    // Keep tooltip in sync with selected options
    const estSelectedLabels = Array.from(estSelect.selectedOptions)
      .map((o) => o.textContent || "")
      .filter(Boolean);
    if (estSelectedLabels.length > 0) {
      attachTip(
        estSelect,
        `Estimated (${estSelectedLabels.length}): ${estSelectedLabels.join(", ")}`
      );
    } else {
      attachTip(
        estSelect,
        "Pick one or more estimated MIDI files produced by transcription systems."
      );
    }
    updateMetrics();
  });

  // Initial update
  updateFileOptions();

  // Listen for state changes to update file list
  deps.stateManager.onStateChange(() => {
    updateFileOptions();
  });

  // Build section
  refGroup.append(refLabel, refSelect);
  estGroup.append(estLabel, estSelect);
  anchorGroup.append(anchorLabel, anchorSelect);
  kOfNGroup.append(kOfNLabel, kOfNInput);

  section.append(
    header,
    refGroup,
    estGroup,
    tolerancesGroup,
    anchorGroup,
    kOfNGroup,
    metricsBox
  );

  return section;
}
