/**
 * Create a header element for the settings modal.
 *
 * @param titleText - Text to display as the modal title
 * @param onClose   - Callback that removes the modal overlay
 */
export function createModalHeader(
  titleText: string,
  onClose: () => void
): HTMLElement {
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;justify-content:space-between;align-items:center;";
  const title = document.createElement("h2");
  title.textContent = titleText;
  title.style.cssText = "margin:0;font-size:20px;font-weight:700;";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText =
    "border:none;background:transparent;font-size:24px;cursor:pointer;color:#6c757d;";
  closeBtn.onclick = onClose;

  header.appendChild(title);
  header.appendChild(closeBtn);
  return header;
}
