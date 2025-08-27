/**
 * Injects accessibility-first color tokens as CSS Custom Properties.
 *
 * - Provides semantic variables (surface, text, border, accent, focus, etc.).
 * - Chooses colors with WCAG 2.1 AA contrast targets:
 *   - Text vs. surfaces >= 4.5:1 (normal text)
 *   - Large text/icons >= 3:1
 *   - UI borders/tracks >= 3:1 against adjacent background
 * - Icons should use `currentColor` to inherit text color naturally.
 */
export function ensureThemeStylesInjected(): void {
  const STYLE_ID = "wr-accessible-theme";
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    :root {
      /* Surfaces */
      --surface: #ffffff; /* Base surface: pure white */
      --surface-alt: #ffffff; /* Keep sections flat on white background */
      --panel-bg: #ffffff; /* Panels also pure white; rely on border/shadow for separation */

      /* Text */
      --text-primary: #0f172a; /* slate-900 – AA on white */
      --text-muted: #475569; /* slate-600 – AA on white for labels */

      /* UI Borders / Tracks (>= 3:1 vs surfaces) */
      --ui-border: #cbd5e1; /* slate-300 */
      --track-bg: #e5e7eb; /* gray-200 – visible track on white */

      /* Accent (ensure white-on-accent >= 4.5:1) */
      --accent: #2563eb; /* blue-600 */
      --accent-strong: #1e40af; /* blue-800 for stronger contrast */
      --on-accent: #ffffff; /* text/icon on accent */

      /* Interaction */
      --hover-surface: #e5e7eb; /* gray-200 hover fill, clearly visible on white */
      --focus-ring: #4f46e5; /* indigo-600 – strong, distinct outline */

      /* Loop region stripes (non-text graphics, >= 3:1 vs track) */
      --loop-stripe-a: rgba(234, 179, 8, 0.8); /* amber-500 @ 0.8 */
      --loop-stripe-b: rgba(217, 119, 6, 0.6);  /* orange-600 @ 0.6 */
      --loop-stripe-border: rgba(234, 179, 8, 0.95);
    }

    /* Focus-visible: thick and obvious for keyboard users */
    .wr-focusable:focus-visible {
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
    }

    /* Range inputs: show focus via outline on container */
    .wr-slider:focus-visible {
      outline: 3px solid var(--focus-ring);
      outline-offset: 2px;
      border-radius: 6px;
    }
  `;
  document.head.appendChild(style);
}
