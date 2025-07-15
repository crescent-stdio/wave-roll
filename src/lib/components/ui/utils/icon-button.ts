/**
 * Create an icon button
 * @param icon - The icon to display
 * @param onClick - The function to call when the button is clicked
 * @param title - The title of the button
 * @returns The button element
 */
export interface IconButtonOptions {
  /** Optional custom size for the button (width & height) in px. */
  size?: number;
}

export const createIconButton = (
  icon: string,
  onClick: () => void,
  title?: string,
  options: IconButtonOptions = {}
): HTMLButtonElement => {
  const { size = 32 } = options;

  const button = document.createElement("button");
  button.innerHTML = icon;
  button.onclick = onClick;
  if (title) button.title = title;

  button.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    padding: 0;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    background: transparent;
    color: #495057;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  `;

  /* ---------------- hover / active effects ---------------- */
  button.addEventListener("mouseenter", () => {
    button.style.transform = "translateY(-1px)";
    button.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
  });

  button.addEventListener("mouseleave", () => {
    button.style.transform = "translateY(0)";
    button.style.boxShadow = "none";
  });

  button.addEventListener("mousedown", () => {
    button.style.transform = "translateY(0) scale(0.96)";
  });

  button.addEventListener("mouseup", () => {
    button.style.transform = "translateY(-1px) scale(1)";
  });

  return button;
};
