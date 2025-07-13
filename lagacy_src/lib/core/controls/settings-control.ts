import { PLAYER_ICONS } from "../../../assets/player-icons";

export function createSettingsControl(pianoRoll: any): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    align-items: center;
  `;

  const createIconButton = (
    iconSvg: string,
    onClick: () => void
  ): HTMLButtonElement => {
    const button = document.createElement("button");
    button.innerHTML = iconSvg;
    button.onclick = onClick;
    button.style.cssText = `
      width: 36px;
      height: 36px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: #e9ecef;
      color: #6c757d;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    `;
    button.addEventListener("mouseenter", () => {
      button.style.transform = "translateY(-1px)";
      button.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.transform = "translateY(0)";
      button.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.05)";
    });
    button.addEventListener("mousedown", () => {
      button.style.transform = "translateY(0) scale(0.95)";
    });
    button.addEventListener("mouseup", () => {
      button.style.transform = "translateY(-1px) scale(1)";
    });
    return button;
  };

  // Gear button opens modal overlay
  const settingsBtn = createIconButton(PLAYER_ICONS.settings, () => {
    if (document.getElementById("zoom-settings-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "zoom-settings-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    `;

    const modal = document.createElement("div");
    modal.style.cssText = `
      background: #ffffff;
      padding: 24px 20px;
      border-radius: 10px;
      width: 320px;
      max-width: 90%;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const title = document.createElement("h3");
    title.textContent = "Zoom Settings";
    title.style.cssText = `
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: #343a40;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `
      border: none;
      background: transparent;
      font-size: 18px;
      cursor: pointer;
      color: #6c757d;
    `;
    closeBtn.onclick = () => overlay.remove();

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Time-step input group
    const stepInputGroup = document.createElement("div");
    stepInputGroup.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
    `;

    const stepLabel = document.createElement("label");
    stepLabel.textContent = "Time step:";
    stepLabel.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6c757d;
    `;

    const stepInput = document.createElement("input");
    stepInput.type = "number";
    stepInput.min = "0.1";
    stepInput.step = "0.1";
    stepInput.value = (pianoRoll?.getTimeStep?.() ?? 1).toString();
    stepInput.style.cssText = `
      width: 64px;
      padding: 4px 6px;
      border: 1px solid #ced4da;
      border-radius: 6px;
      font-size: 12px;
      text-align: center;
      color: #007bff;
      background: #ffffff;
    `;

    const stepSuffix = document.createElement("span");
    stepSuffix.textContent = "s";
    stepSuffix.style.cssText = stepLabel.style.cssText;

    const applyStep = () => {
      const v = parseFloat(stepInput.value);
      if (!isNaN(v) && v > 0) {
        pianoRoll?.setTimeStep?.(v);
      }
    };
    stepInput.addEventListener("change", applyStep);
    stepInput.addEventListener("blur", applyStep);

    stepInputGroup.appendChild(stepLabel);
    stepInputGroup.appendChild(stepInput);
    stepInputGroup.appendChild(stepSuffix);

    modal.appendChild(header);
    modal.appendChild(stepInputGroup);
    overlay.appendChild(modal);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  });
  settingsBtn.title = "Zoom Settings";

  container.appendChild(settingsBtn);
  return container;
}
