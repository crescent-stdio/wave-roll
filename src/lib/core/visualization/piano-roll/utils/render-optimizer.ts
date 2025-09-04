/**
 * Rendering optimization utilities for viewport culling and performance
 */

import type { Rectangle } from './drawing-primitives';

/**
 * Render optimization helper class
 */
export class RenderOptimizer {
  /**
   * Check if an element should be rendered based on viewport bounds
   */
  static shouldRenderElement(
    elementBounds: Rectangle,
    viewportBounds: Rectangle,
    margin: number = 10
  ): boolean {
    // Check if element is outside viewport (with margin)
    const leftEdge = viewportBounds.x - margin;
    const rightEdge = viewportBounds.x + viewportBounds.width + margin;
    const topEdge = viewportBounds.y - margin;
    const bottomEdge = viewportBounds.y + viewportBounds.height + margin;
    
    // Element is culled if completely outside viewport
    if (elementBounds.x + elementBounds.width < leftEdge) return false;
    if (elementBounds.x > rightEdge) return false;
    if (elementBounds.y + elementBounds.height < topEdge) return false;
    if (elementBounds.y > bottomEdge) return false;
    
    return true;
  }

  /**
   * Check if a point is within viewport
   */
  static isPointInViewport(
    x: number,
    y: number,
    viewportBounds: Rectangle,
    margin: number = 0
  ): boolean {
    return x >= viewportBounds.x - margin &&
           x <= viewportBounds.x + viewportBounds.width + margin &&
           y >= viewportBounds.y - margin &&
           y <= viewportBounds.y + viewportBounds.height + margin;
  }

  /**
   * Iterate over items with viewport culling
   */
  static culledForEach<T>(
    items: T[],
    viewportBounds: Rectangle,
    getBounds: (item: T) => Rectangle,
    callback: (item: T, index: number) => void,
    margin: number = 10
  ): void {
    items.forEach((item, index) => {
      const bounds = getBounds(item);
      if (this.shouldRenderElement(bounds, viewportBounds, margin)) {
        callback(item, index);
      }
    });
  }

  /**
   * Filter items based on viewport visibility
   */
  static filterVisible<T>(
    items: T[],
    viewportBounds: Rectangle,
    getBounds: (item: T) => Rectangle,
    margin: number = 10
  ): T[] {
    return items.filter(item => {
      const bounds = getBounds(item);
      return this.shouldRenderElement(bounds, viewportBounds, margin);
    });
  }

  /**
   * Get indices of visible items
   */
  static getVisibleIndices<T>(
    items: T[],
    viewportBounds: Rectangle,
    getBounds: (item: T) => Rectangle,
    margin: number = 10
  ): number[] {
    const indices: number[] = [];
    items.forEach((item, index) => {
      const bounds = getBounds(item);
      if (this.shouldRenderElement(bounds, viewportBounds, margin)) {
        indices.push(index);
      }
    });
    return indices;
  }

  /**
   * Binary search for first visible item (assumes items are sorted by position)
   */
  static findFirstVisible<T>(
    items: T[],
    viewportStart: number,
    getPosition: (item: T) => number,
    margin: number = 10
  ): number {
    let left = 0;
    let right = items.length - 1;
    let result = items.length;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const position = getPosition(items[mid]);
      
      if (position >= viewportStart - margin) {
        result = mid;
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    
    return result;
  }

  /**
   * Binary search for last visible item (assumes items are sorted by position)
   */
  static findLastVisible<T>(
    items: T[],
    viewportEnd: number,
    getPosition: (item: T) => number,
    margin: number = 10
  ): number {
    let left = 0;
    let right = items.length - 1;
    let result = -1;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const position = getPosition(items[mid]);
      
      if (position <= viewportEnd + margin) {
        result = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    
    return result;
  }

  /**
   * Get visible range using binary search (for sorted items)
   */
  static getVisibleRange<T>(
    items: T[],
    viewportStart: number,
    viewportEnd: number,
    getPosition: (item: T) => number,
    margin: number = 10
  ): { start: number; end: number } {
    const start = this.findFirstVisible(items, viewportStart, getPosition, margin);
    const end = this.findLastVisible(items, viewportEnd, getPosition, margin);
    
    return { start, end };
  }

  /**
   * Check if rendering should be skipped based on zoom level
   */
  static shouldSkipDetailAtZoom(
    zoomLevel: number,
    minZoomForDetail: number = 0.5
  ): boolean {
    return zoomLevel < minZoomForDetail;
  }

  /**
   * Calculate level of detail based on zoom
   */
  static getLevelOfDetail(zoomLevel: number): 'low' | 'medium' | 'high' {
    if (zoomLevel < 0.5) return 'low';
    if (zoomLevel < 1.5) return 'medium';
    return 'high';
  }
}