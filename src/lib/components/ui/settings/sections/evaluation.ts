import { UIComponentDependencies } from "../../types";
import { precision_recall_f1_overlap } from "@/lib/evaluation/transcription/metrics";
import { ParsedMidi } from "@/lib/midi/types";

export function createEvaluationSection(
  deps: UIComponentDependencies
): HTMLDivElement {
  const section = document.createElement("div");
  section.style.cssText = "display:flex;flex-direction:column;gap:12px;";

  // Header
  const header = document.createElement("h3");
  header.textContent = "Evaluation";
  header.style.cssText = "margin:0;font-size:14px;font-weight:600;";

  // Reference file select
  const refGroup = document.createElement("div");
  refGroup.style.cssText =
    "display:flex;align-items:center;gap:6px;font-size:12px;";

  const refLabel = document.createElement("span");
  refLabel.textContent = "Reference:";
  refLabel.style.cssText = "min-width:80px;font-weight:600;";

  const refSelect = document.createElement("select");
  refSelect.style.cssText =
    "flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;";

  // Add empty option
  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.textContent = "(none)";
  refSelect.appendChild(emptyOpt);

  // Estimated files multi-select
  const estGroup = document.createElement("div");
  estGroup.style.cssText =
    "display:flex;align-items:start;gap:6px;font-size:12px;";

  const estLabel = document.createElement("span");
  estLabel.textContent = "Estimated:";
  estLabel.style.cssText = "min-width:80px;font-weight:600;padding-top:4px;";

  const estSelect = document.createElement("select");
  estSelect.multiple = true;
  estSelect.style.cssText =
    "flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;min-height:60px;";

  // Tolerances inputs
  const tolerancesGroup = document.createElement("div");
  tolerancesGroup.style.cssText = "display:flex;flex-direction:column;gap:6px;";

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

    const lbl = document.createElement("span");
    lbl.textContent = label;
    lbl.style.cssText = "min-width:120px;font-weight:600;";

    const input = document.createElement("input");
    input.type = "number";
    input.step = step;
    input.style.cssText =
      "flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;";
    input.value = String(deps.stateManager.getState().evaluation[field]);

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

  const anchorLabel = document.createElement("span");
  anchorLabel.textContent = "Anchor:";
  anchorLabel.style.cssText = "min-width:80px;font-weight:600;";

  const anchorSelect = document.createElement("select");
  anchorSelect.style.cssText =
    "flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;";

  ["intersection", "ref", "est"].forEach((anchor) => {
    const opt = document.createElement("option");
    opt.value = anchor;
    opt.textContent = anchor;
    anchorSelect.appendChild(opt);
  });

  anchorSelect.value = deps.stateManager.getState().evaluation.anchor;
  anchorSelect.addEventListener("change", () => {
    deps.stateManager.updateEvaluationState({
      anchor: anchorSelect.value as "intersection" | "ref" | "est",
    });
  });

  // K-of-N input (for future use)
  const kOfNGroup = document.createElement("div");
  kOfNGroup.style.cssText =
    "display:flex;align-items:center;gap:6px;font-size:12px;";

  const kOfNLabel = document.createElement("span");
  kOfNLabel.textContent = "K-of-N:";
  kOfNLabel.style.cssText = "min-width:80px;font-weight:600;";

  const kOfNInput = document.createElement("input");
  kOfNInput.type = "number";
  kOfNInput.min = "1";
  kOfNInput.step = "1";
  kOfNInput.style.cssText =
    "flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;";
  kOfNInput.value = String(deps.stateManager.getState().evaluation.kOfN);

  kOfNInput.addEventListener("change", () => {
    deps.stateManager.updateEvaluationState({
      kOfN: parseInt(kOfNInput.value),
    });
  });

  // Metrics display
  const metricsBox = document.createElement("div");
  metricsBox.style.cssText =
    "border:1px solid #ced4da;border-radius:6px;padding:8px;background:#f8f9fa;font-size:11px;font-family:monospace;";

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

    // For now, only use the first estimated file
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
    const currentRef = refSelect.value;
    const currentEst = Array.from(estSelect.selectedOptions).map(
      (o) => o.value
    );

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
      refSelect.appendChild(refOpt);

      // Add to estimated select
      const estOpt = document.createElement("option");
      estOpt.value = file.id;
      estOpt.textContent = file.displayName;
      estSelect.appendChild(estOpt);
    });

    // Restore selections
    refSelect.value = currentRef;
    Array.from(estSelect.options).forEach((opt) => {
      if (currentEst.includes(opt.value)) {
        opt.selected = true;
      }
    });

    // Update state if needed
    const state = deps.stateManager.getState().evaluation;
    if (state.refId !== refSelect.value) {
      deps.stateManager.updateEvaluationState({
        refId: refSelect.value || null,
      });
    }

    const newEstIds = Array.from(estSelect.selectedOptions).map((o) => o.value);
    if (JSON.stringify(state.estIds) !== JSON.stringify(newEstIds)) {
      deps.stateManager.updateEvaluationState({ estIds: newEstIds });
    }

    updateMetrics();
  };

  // Event listeners
  refSelect.addEventListener("change", () => {
    deps.stateManager.updateEvaluationState({
      refId: refSelect.value || null,
    });
    updateMetrics();
  });

  estSelect.addEventListener("change", () => {
    const selected = Array.from(estSelect.selectedOptions).map((o) => o.value);
    deps.stateManager.updateEvaluationState({
      estIds: selected,
    });
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
