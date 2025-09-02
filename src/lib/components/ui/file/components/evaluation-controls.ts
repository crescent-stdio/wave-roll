/**
 * Evaluation controls for reference and estimation file selection
 */

import { PLAYER_ICONS } from "@/assets/player-icons";
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
    const { fileId, isReference, dependencies, container } = config;

    const pinBtn = createIconButton(
      PLAYER_ICONS.pin,
      () => this.handleReferenceToggle(fileId, dependencies, container),
      isReference ? "Unset as reference" : "Set as reference",
      { size: 24 }
    );

    pinBtn.style.color = isReference ? "#0d6efd" : "#adb5bd";
    pinBtn.style.border = "none";
    pinBtn.style.boxShadow = "none";
    pinBtn.setAttribute("data-role", "ref-pin");
    pinBtn.setAttribute("data-file-id", fileId);

    return pinBtn;
  }

  /**
   * Create estimation toggle button
   */
  static createEstimationButton(config: EvaluationControlsConfig): HTMLButtonElement {
    const { fileId, isReference, isEstimated, dependencies, container } = config;

    const estBtn = createIconButton(
      PLAYER_ICONS.est,
      () => this.handleEstimationToggle(fileId, dependencies, container),
      isEstimated ? "Unset as estimated" : "Set as estimated",
      { size: 24 }
    );

    estBtn.style.color = isEstimated ? "#198754" : "#adb5bd";
    estBtn.style.border = "none";
    estBtn.style.boxShadow = "none";
    estBtn.setAttribute("data-role", "est-toggle");
    estBtn.setAttribute("data-file-id", fileId);

    if (isReference) {
      estBtn.style.opacity = "0.5";
      estBtn.style.pointerEvents = "none";
      estBtn.title = "Cannot set Reference as Estimated";
    }

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
    this.updateReferenceButtons(container, nextRef);
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
    
    if (evalState.refId === fileId) {
      return; // Do not allow marking ref as estimated
    }

    const already = evalState.estIds.includes(fileId);
    const next = already
      ? evalState.estIds.filter((id) => id !== fileId)
      : [...evalState.estIds, fileId];
    const filtered = evalState.refId
      ? next.filter((id) => id !== evalState.refId)
      : next;

    dependencies.stateManager.updateEvaluationState({ estIds: filtered });

    // Optimistically update UI
    this.updateEstimationButtons(container, evalState.refId, filtered);
  }

  /**
   * Update reference buttons UI
   */
  private static updateReferenceButtons(
    container: HTMLElement,
    nextRef: string | null
  ): void {
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[data-role=ref-pin]")
    );

    buttons.forEach((btn) => {
      const fid = btn.getAttribute("data-file-id");
      const active = nextRef !== null && fid === nextRef;
      btn.style.color = active ? "#0d6efd" : "#adb5bd";
      btn.title = active ? "Unset as reference" : "Set as reference";
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
      const isRefBtn = refId !== null && fid === refId;
      
      btn.style.color = active ? "#198754" : "#adb5bd";
      btn.title = active ? "Unset as estimated" : "Set as estimated";
      
      if (isRefBtn) {
        btn.style.opacity = "0.5";
        btn.style.pointerEvents = "none";
        btn.title = "Cannot set Reference as Estimated";
      } else {
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
      }
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
  }
}