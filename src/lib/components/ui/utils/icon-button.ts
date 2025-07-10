/**
 * Create an icon button
 * @param icon - The icon to display
 * @param onClick - The function to call when the button is clicked
 * @param title - The title of the button
 * @returns The button element
 */
export const createIconButton = (
  icon: string,
  onClick: () => void,
  title?: string
): HTMLButtonElement => {
  const button = document.createElement("button");
  button.innerHTML = icon;
  button.onclick = onClick;
  if (title) button.title = title;
  button.style.cssText = `
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #495057;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
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
