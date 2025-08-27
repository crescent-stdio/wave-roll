import { UIComponentDependencies } from "../../types";
import { createEvaluationSection } from "../sections/evaluation";

/**
 * Open the Evaluation Results modal.
 * Reuses a single overlay identified by id to avoid duplicates.
 */
export function openEvaluationResultsModal(
  deps: UIComponentDependencies
): void {
  const existing = document.getElementById("evaluation-results-overlay");
  if (existing) {
    if (!existing.parentElement) document.body.appendChild(existing);
    return;
  }

  // Overlay
  const overlay = document.createElement("div");
  overlay.id = "evaluation-results-overlay";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
  `;

  // Modal panel
  const modal = document.createElement("div");
  modal.style.cssText = `
    width: 600px;
    max-width: 95%;
    max-height: 80vh;
    overflow-y: auto;
    background: var(--panel-bg);
    border-radius: 12px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;justify-content:space-between;align-items:center;";
  const title = document.createElement("h2");
  title.textContent = "Evaluation Results";
  title.style.cssText = "margin:0;font-size:20px;font-weight:700;color:var(--text-primary);";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText =
    "border:none;background:transparent;font-size:24px;cursor:pointer;color:var(--text-muted);";
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Body: reuse existing evaluation section component
  const evaluationSection = createEvaluationSection(deps);

  modal.appendChild(header);
  modal.appendChild(evaluationSection);
  overlay.appendChild(modal);

  // Click outside to close
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

