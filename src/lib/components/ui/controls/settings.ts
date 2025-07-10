import { PLAYER_ICONS } from "@/assets/player-icons";
import { UIComponentDependencies } from "../types";
import { createIconButton } from "../utils/icon-button";

export function createSettingsControl(
  dependencies: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    align-items: center;
  `;

  // Settings button
  const settingsBtn = createIconButton(PLAYER_ICONS.settings, () => {
    // Prevent multiple overlays
    if (document.getElementById("zoom-settings-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "zoom-settings-overlay";
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.5);
        display:flex;justify-content:center;align-items:center;z-index:2000;
      `;

    const modal = document.createElement("div");
    modal.style.cssText = `
        width:320px;max-width:90%;background:#fff;border-radius:10px;
        padding:24px;display:flex;flex-direction:column;gap:16px;
      `;

    const header = document.createElement("div");
    header.style.cssText = `display:flex;justify-content:space-between;align-items:center;`;
    const title = document.createElement("h3");
    title.textContent = "Zoom / Grid Settings";
    title.style.cssText = `margin:0;font-size:16px;font-weight:700;`;
    const close = document.createElement("button");
    close.textContent = "✕";
    close.style.cssText = `border:none;background:transparent;font-size:20px;cursor:pointer;color:#6c757d;`;
    close.onclick = () => overlay.remove();
    header.appendChild(title);
    header.appendChild(close);

    // TimeStep
    const tsGroup = document.createElement("div");
    tsGroup.style.cssText = `display:flex;align-items:center;gap:6px;`;
    const tsLabel = document.createElement("span");
    tsLabel.textContent = "Grid step:";
    tsLabel.style.cssText = `font-size:12px;font-weight:600;`;
    const tsInput = document.createElement("input");
    tsInput.type = "number";
    tsInput.min = "0.1";
    tsInput.step = "0.1";
    const curStep = dependencies.pianoRoll?.getTimeStep?.() ?? 1;
    tsInput.value = curStep.toString();
    tsInput.style.cssText = `width:64px;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;font-size:12px;text-align:center;`;
    const tsSuffix = document.createElement("span");
    tsSuffix.textContent = "s";
    tsSuffix.style.cssText = tsLabel.style.cssText;
    const applyTS = () => {
      const v = parseFloat(tsInput.value);
      if (!isNaN(v) && v > 0) {
        dependencies.pianoRoll?.setTimeStep?.(v);
      }
    };
    tsInput.addEventListener("change", applyTS);
    tsInput.addEventListener("blur", applyTS);
    tsGroup.appendChild(tsLabel);
    tsGroup.appendChild(tsInput);
    tsGroup.appendChild(tsSuffix);

    // Minor step
    const mnGroup = document.createElement("div");
    mnGroup.style.cssText = tsGroup.style.cssText;
    const mnLabel = document.createElement("span");
    mnLabel.textContent = "Minor step:";
    mnLabel.style.cssText = tsLabel.style.cssText;
    const mnInput = document.createElement("input");
    mnInput.type = "number";
    mnInput.min = "0.05";
    mnInput.step = "0.05";
    const curMinor =
      dependencies.pianoRoll?.getMinorTimeStep?.() ??
      dependencies.minorTimeStep;
    mnInput.value = curMinor.toString();
    mnInput.style.cssText = tsInput.style.cssText;
    const mnSuffix = document.createElement("span");
    mnSuffix.textContent = "s";
    mnSuffix.style.cssText = tsLabel.style.cssText;
    const applyMinor = () => {
      const v = parseFloat(mnInput.value);
      if (!isNaN(v) && v > 0) {
        dependencies.pianoRoll?.setMinorTimeStep?.(v);
      }
    };
    mnInput.addEventListener("change", applyMinor);
    mnInput.addEventListener("blur", applyMinor);
    mnGroup.appendChild(mnLabel);
    mnGroup.appendChild(mnInput);
    mnGroup.appendChild(mnSuffix);

    modal.appendChild(header);
    modal.appendChild(tsGroup);
    modal.appendChild(mnGroup);
    overlay.appendChild(modal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  });
  settingsBtn.title = "Zoom/Grid Settings";
  container.appendChild(settingsBtn);

  return container;
}
