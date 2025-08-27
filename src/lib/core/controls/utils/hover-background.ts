export function attachHoverBackground(
  btn: HTMLElement,
  hoverColor = "var(--hover-surface)",
  inactiveBackground = "transparent"
): void {
  btn.addEventListener("mouseenter", () => {
    if (!btn.dataset.active) {
      btn.style.background = hoverColor;
    }
  });
  btn.addEventListener("mouseleave", () => {
    if (!btn.dataset.active) {
      btn.style.background = inactiveBackground;
    }
  });
}
