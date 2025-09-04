/**
 * Drawing primitive utilities for consistent rendering
 */

import * as PIXI from 'pixi.js';

export interface LineStyle {
  width: number;
  color: number;
  alpha?: number;
  cap?: PIXI.LineCap;
  join?: PIXI.LineJoin;
}

export interface FillStyle {
  color: number;
  alpha?: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Drawing primitives helper class
 */
export class DrawingPrimitives {
  /**
   * Draw a vertical line
   */
  static drawVerticalLine(
    graphics: PIXI.Graphics,
    x: number,
    height: number,
    style: LineStyle,
    yOffset: number = 0
  ): void {
    graphics.moveTo(x, yOffset);
    graphics.lineTo(x, yOffset + height);
    graphics.stroke(style);
  }

  /**
   * Draw a horizontal line
   */
  static drawHorizontalLine(
    graphics: PIXI.Graphics,
    y: number,
    width: number,
    style: LineStyle,
    xOffset: number = 0
  ): void {
    graphics.moveTo(xOffset, y);
    graphics.lineTo(xOffset + width, y);
    graphics.stroke(style);
  }

  /**
   * Draw a rectangle with fill
   */
  static drawRectangle(
    graphics: PIXI.Graphics,
    bounds: Rectangle,
    fillStyle?: FillStyle,
    strokeStyle?: LineStyle
  ): void {
    if (fillStyle) {
      graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      graphics.fill(fillStyle);
    }
    
    if (strokeStyle) {
      graphics.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      graphics.stroke(strokeStyle);
    }
  }

  /**
   * Draw a rounded rectangle
   */
  static drawRoundedRectangle(
    graphics: PIXI.Graphics,
    bounds: Rectangle,
    radius: number,
    fillStyle?: FillStyle,
    strokeStyle?: LineStyle
  ): void {
    if (fillStyle) {
      graphics.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius);
      graphics.fill(fillStyle);
    }
    
    if (strokeStyle) {
      graphics.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius);
      graphics.stroke(strokeStyle);
    }
  }

  /**
   * Draw a circle
   */
  static drawCircle(
    graphics: PIXI.Graphics,
    x: number,
    y: number,
    radius: number,
    fillStyle?: FillStyle,
    strokeStyle?: LineStyle
  ): void {
    if (fillStyle) {
      graphics.circle(x, y, radius);
      graphics.fill(fillStyle);
    }
    
    if (strokeStyle) {
      graphics.circle(x, y, radius);
      graphics.stroke(strokeStyle);
    }
  }

  /**
   * Draw a dashed line (vertical)
   */
  static drawDashedVerticalLine(
    graphics: PIXI.Graphics,
    x: number,
    height: number,
    dashLength: number,
    gapLength: number,
    style: LineStyle,
    yOffset: number = 0
  ): void {
    let currentY = yOffset;
    const endY = yOffset + height;
    
    while (currentY < endY) {
      const dashEnd = Math.min(currentY + dashLength, endY);
      graphics.moveTo(x, currentY);
      graphics.lineTo(x, dashEnd);
      graphics.stroke(style);
      currentY = dashEnd + gapLength;
    }
  }

  /**
   * Draw a dashed line (horizontal)
   */
  static drawDashedHorizontalLine(
    graphics: PIXI.Graphics,
    y: number,
    width: number,
    dashLength: number,
    gapLength: number,
    style: LineStyle,
    xOffset: number = 0
  ): void {
    let currentX = xOffset;
    const endX = xOffset + width;
    
    while (currentX < endX) {
      const dashEnd = Math.min(currentX + dashLength, endX);
      graphics.moveTo(currentX, y);
      graphics.lineTo(dashEnd, y);
      graphics.stroke(style);
      currentX = dashEnd + gapLength;
    }
  }

  /**
   * Clear and reset graphics object
   */
  static clearGraphics(graphics: PIXI.Graphics): void {
    graphics.clear();
  }

  /**
   * Draw grid lines
   */
  static drawGrid(
    graphics: PIXI.Graphics,
    bounds: Rectangle,
    cellWidth: number,
    cellHeight: number,
    style: LineStyle
  ): void {
    // Draw vertical lines
    for (let x = bounds.x; x <= bounds.x + bounds.width; x += cellWidth) {
      this.drawVerticalLine(graphics, x, bounds.height, style, bounds.y);
    }
    
    // Draw horizontal lines
    for (let y = bounds.y; y <= bounds.y + bounds.height; y += cellHeight) {
      this.drawHorizontalLine(graphics, y, bounds.width, style, bounds.x);
    }
  }
}