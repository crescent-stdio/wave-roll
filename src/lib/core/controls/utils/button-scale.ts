export function attachButtonScale(
  btn: HTMLElement,
  hoverScale = 1.05,
  activeScale = 0.95,
  defaultScale = 1
): void {
  btn.addEventListener("mouseenter", () => {
    btn.style.transform = `scale(${hoverScale})`;
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.transform = `scale(${defaultScale})`;
  });
  btn.addEventListener("mousedown", () => {
    btn.style.transform = `scale(${activeScale})`;
  });
  btn.addEventListener("mouseup", () => {
    btn.style.transform = `scale(${hoverScale})`;
  });
}
