export function attachHoverBackground(
  btn: HTMLElement,
  hoverColor = "rgba(0, 0, 0, 0.05)",
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
