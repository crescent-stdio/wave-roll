/**
 * Evaluation controls for reference and estimation file selection
 */

import { UIComponentDependencies } from "@/lib/components/ui";
import { createIconButton } from "../../utils/icon-button";

export interface EvaluationControlsConfig {
  fileId: string;
  isReference: boolean;
  isEstimated: boolean;
  dependencies: UIComponentDependencies;
  container: HTMLElement;
}

export class EvaluationControls {
  /**
   * Create reference pin button
   */
  static createReferenceButton(config: EvaluationControlsConfig): HTMLButtonElement {
    const { fileId, isReference, isEstimated, dependencies, container } = config;

    // Replace icon button with a compact text button labeled [REF]
    const refBtn = document.createElement("button");
    refBtn.type = "button";
    refBtn.textContent = "[REF]";
    refBtn.title = isReference ? "Unset as reference" : "Set as reference";
    refBtn.onclick = () => this.handleReferenceToggle(fileId, dependencies, container);

    // Compact style to match other controls
    refBtn.style.cssText = `
      height: 24px;
      padding: 0 8px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: ${isReference ? "#0d6efd" : "#adb5bd"};
      cursor: pointer;
      font-size: 11px;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      line-height: 22px;
    `;
    refBtn.style.boxShadow = "none";
    refBtn.setAttribute("data-role", "ref-pin");
    refBtn.setAttribute("data-file-id", fileId);

    // Allow clicking even if currently estimated; logic will swap roles.

    return refBtn;
  }

  /**
   * Create estimation toggle button
   */
  static createEstimationButton(config: EvaluationControlsConfig): HTMLButtonElement {
    const { fileId, isReference, isEstimated, dependencies, container } = config;

    const estBtn = document.createElement("button");
    estBtn.type = "button";
    estBtn.textContent = "[EST]";
    estBtn.title = isEstimated ? "Unset as estimated" : "Set as estimated";
    estBtn.onclick = () => this.handleEstimationToggle(fileId, dependencies, container);

    estBtn.style.cssText = `
      height: 24px;
      padding: 0 8px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: ${isEstimated ? "#198754" : "#adb5bd"};
      cursor: pointer;
      font-size: 11px;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      line-height: 22px;
    `;
    estBtn.style.boxShadow = "none";
    estBtn.setAttribute("data-role", "est-toggle");
    estBtn.setAttribute("data-file-id", fileId);

    // Allow clicking even if currently reference; logic will swap roles.

    return estBtn;
  }

  /**
   * Handle reference toggle
   */
  private static handleReferenceToggle(
    fileId: string,
    dependencies: UIComponentDependencies,
    container: HTMLElement
  ): void {
    const evalState = dependencies.stateManager.getState().evaluation;
    const nextRef = evalState.refId === fileId ? null : fileId;
    const nextEstIds = nextRef
      ? evalState.estIds.filter((id) => id !== nextRef)
      : evalState.estIds.slice();

    dependencies.stateManager.updateEvaluationState({
      refId: nextRef,
      estIds: nextEstIds,
    });

    // Optimistically update UI
    this.updateReferenceButtons(container, nextRef, nextEstIds);
    this.updateEstimationButtons(container, nextRef, nextEstIds);
  }

  /**
   * Handle estimation toggle
   */
  private static handleEstimationToggle(
    fileId: string,
    dependencies: UIComponentDependencies,
    container: HTMLElement
  ): void {
    const evalState = dependencies.stateManager.getState().evaluation;
    
    // If this file is currently the reference, switch: unset ref and set as [EST]
    if (evalState.refId === fileId) {
      const newEstIds = [fileId];
      dependencies.stateManager.updateEvaluationState({ refId: null, estIds: newEstIds });
      this.updateEstimationButtons(container, null, newEstIds);
      this.updateReferenceButtons(container, null, newEstIds);
      return;
    }

    // Enforce single selection: toggle to [fileId] or []
    const already = evalState.estIds.includes(fileId);
    const nextSingle = already ? [] : [fileId];
    const filtered = evalState.refId
      ? nextSingle.filter((id) => id !== evalState.refId)
      : nextSingle;

    dependencies.stateManager.updateEvaluationState({ estIds: filtered });

    // Optimistically update UI
    this.updateEstimationButtons(container, evalState.refId, filtered);
    this.updateReferenceButtons(container, evalState.refId, filtered);
  }

  /**
   * Update reference buttons UI
   */
  private static updateReferenceButtons(
    container: HTMLElement,
    nextRef: string | null,
    estIds: string[]
  ): void {
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[data-role=ref-pin]")
    );

    buttons.forEach((btn) => {
      const fid = btn.getAttribute("data-file-id") || "";
      const active = nextRef !== null && fid === nextRef;
      btn.style.color = active ? "#0d6efd" : "#adb5bd";
      btn.title = active ? "Unset as reference" : "Set as reference";
      // Keep buttons interactive for swap behavior
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
    });
  }

  /**
   * Update estimation buttons UI
   */
  private static updateEstimationButtons(
    container: HTMLElement,
    refId: string | null,
    estIds: string[]
  ): void {
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[data-role=est-toggle]")
    );

    buttons.forEach((btn) => {
      const fid = btn.getAttribute("data-file-id") || "";
      const active = estIds.includes(fid);
      
      btn.style.color = active ? "#198754" : "#adb5bd";
      btn.title = active ? "Unset as estimated" : "Set as estimated";
      
      // Keep buttons interactive for swap behavior
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
    });
  }

  /**
   * Ensure default reference and estimation files
   */
  static ensureDefaults(dependencies: UIComponentDependencies): void {
    const evalState = dependencies.stateManager.getState().evaluation;
    const files = dependencies.midiManager.getState().files;
    const currentRef = evalState.refId;
    const refStillExists = currentRef
      ? files.some((f) => f.id === currentRef)
      : false;

    // Set default reference if needed
    if (!currentRef && files.length > 0) {
      dependencies.stateManager.updateEvaluationState({ refId: files[0].id });
    } else if (currentRef && !refStillExists) {
      dependencies.stateManager.updateEvaluationState({
        refId: files.length > 0 ? files[0].id : null,
      });
    }

    // Set default estimated files if needed
    const latestEval = dependencies.stateManager.getState().evaluation;
    if (latestEval.estIds.length === 0 && files.length > 1) {
      const refCandidate = latestEval.refId ?? files[0].id;
      const defaultEst = files.find((f) => f.id !== refCandidate);
      if (defaultEst) {
        dependencies.stateManager.updateEvaluationState({
          estIds: [defaultEst.id],
        });
      }
    }

    // Sanitize: ensure refId is not inside estIds
    const sEval = dependencies.stateManager.getState().evaluation;
    if (sEval.refId && sEval.estIds.includes(sEval.refId)) {
      const filtered = sEval.estIds.filter((id) => id !== sEval.refId);
      dependencies.stateManager.updateEvaluationState({ estIds: filtered });
    }

    // Enforce single estimated selection globally (keep only the first if multiple)
    const sEval2 = dependencies.stateManager.getState().evaluation;
    if (sEval2.estIds.length > 1) {
      dependencies.stateManager.updateEvaluationState({ estIds: [sEval2.estIds[0]] });
    }
  }
}