// (No imports needed)

/** Describe A-B loop window in percentage units (0-100). */
export interface LoopPoints {
  /** Start marker (A) - percentage or null when not set. */
  a: number | null;
  /** End marker (B) - percentage or null when not set. */
  b: number | null;
}

export interface LoopDisplayDeps {
  /** Current loop window [percent] - can be null when inactive. */
  loopPoints: LoopPoints | null;
  /** <div> behind progress-bar showing golden region. */
  loopRegion: HTMLElement | null | undefined;
  /** DOM marker for point-A. */
  markerA: HTMLElement | null | undefined;
  /** DOM marker for point-B. */
  markerB: HTMLElement | null | undefined;
}

/**
 * Update the visual loop overlay inside the seek-bar.
 *
 * This helper centralises the DOM tweaks so the player's update-loop
 * remains tidy. All percentages are expressed in the seek-bar's width.
 */
export function updateLoopDisplay({
  loopPoints,
  loopRegion,
  markerA,
  markerB,
}: LoopDisplayDeps): void {
  if (!loopRegion || !markerA || !markerB) {
    return; // Defensive - refs not yet ready.
  }

  // console.log("[Loop-Display] Updating markers:", loopPoints);

  if (loopPoints && (loopPoints.a !== null || loopPoints.b !== null)) {
    /* ---------------------------------------------
     * Marker A
     * ------------------------------------------- */
    if (loopPoints.a !== null) {
      markerA.style.display = "block";
      markerA.style.left = `${loopPoints.a}%`;
      // console.log(`[Loop-Display] Marker A positioned at ${loopPoints.a}%`);
    } else {
      markerA.style.display = "none";
    }

    /* ---------------------------------------------
     * Marker B
     * ------------------------------------------- */
    if (loopPoints.b !== null) {
      markerB.style.display = "block";
      markerB.style.left = `${loopPoints.b}%`;
      // console.log(`[Loop-Display] Marker B positioned at ${loopPoints.b}%`);
    } else {
      markerB.style.display = "none";
    }

    /* ---------------------------------------------
     * Striped region - only when both markers exist
     * ------------------------------------------- */
    if (loopPoints.a !== null && loopPoints.b !== null) {
      loopRegion.style.display = "block";
      loopRegion.style.left = `${loopPoints.a}%`;
      loopRegion.style.width = `${loopPoints.b - loopPoints.a}%`;
    } else {
      loopRegion.style.display = "none";
    }
  } else {
    // Hide everything when no active loop
    loopRegion.style.display = "none";
    markerA.style.display = "none";
    markerB.style.display = "none";
  }
}
