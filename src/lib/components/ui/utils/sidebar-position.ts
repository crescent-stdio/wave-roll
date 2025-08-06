export const SIDEBAR_WIDTH = 300;
export const SIDEBAR_GAP = 20; // matches flex gap between sidebar and player column
export const ICON_BUTTON_MARGIN = 12; // margin from edge when sidebar hidden

/**
 * Calculate the CSS `left` value (px) for the hamburger / sidebar-toggle button
 * based on whether the sidebar is currently visible.
 */
export function calcToggleButtonLeft(visible: boolean): string {
  return visible
    ? `${SIDEBAR_WIDTH + SIDEBAR_GAP + ICON_BUTTON_MARGIN}px`
    : `${ICON_BUTTON_MARGIN}px`;
}
