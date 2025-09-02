/**
 * Shape renderer utility for file indicators
 * Creates SVG shapes based on file ID hash
 */

export type ShapeType = 'circle' | 'triangle' | 'diamond' | 'square';

export class ShapeRenderer {
  /**
   * Get shape type based on file ID hash
   */
  static getShapeType(fileId: string): ShapeType {
    let hash = 0;
    for (let i = 0; i < fileId.length; i++) {
      hash = (hash * 31 + fileId.charCodeAt(i)) >>> 0;
    }
    const shapes: ShapeType[] = ['circle', 'triangle', 'diamond', 'square'];
    return shapes[hash % shapes.length];
  }

  /**
   * Create SVG shape element
   */
  static createShapeSVG(
    shape: ShapeType,
    color: string,
    size: number = 12
  ): SVGElement {
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);

    let shapeElement: SVGElement;
    const center = size / 2;
    const radius = size / 3;

    switch (shape) {
      case 'circle':
        shapeElement = document.createElementNS(svgNS, "circle");
        shapeElement.setAttribute("cx", String(center));
        shapeElement.setAttribute("cy", String(center));
        shapeElement.setAttribute("r", String(radius));
        break;

      case 'triangle':
        shapeElement = document.createElementNS(svgNS, "polygon");
        const t1 = `${center},${size * 0.17}`;
        const t2 = `${size * 0.83},${size * 0.83}`;
        const t3 = `${size * 0.17},${size * 0.83}`;
        shapeElement.setAttribute("points", `${t1} ${t2} ${t3}`);
        break;

      case 'diamond':
        shapeElement = document.createElementNS(svgNS, "polygon");
        const d1 = `${center},${size * 0.08}`;
        const d2 = `${size * 0.92},${center}`;
        const d3 = `${center},${size * 0.92}`;
        const d4 = `${size * 0.08},${center}`;
        shapeElement.setAttribute("points", `${d1} ${d2} ${d3} ${d4}`);
        break;

      case 'square':
      default:
        shapeElement = document.createElementNS(svgNS, "rect");
        const squareSize = size * 0.67;
        const offset = (size - squareSize) / 2;
        shapeElement.setAttribute("x", String(offset));
        shapeElement.setAttribute("y", String(offset));
        shapeElement.setAttribute("width", String(squareSize));
        shapeElement.setAttribute("height", String(squareSize));
        break;
    }

    shapeElement.setAttribute("fill", color);
    shapeElement.setAttribute("stroke", color);
    shapeElement.setAttribute("stroke-width", "2");
    svg.appendChild(shapeElement);

    return svg;
  }

  /**
   * Create color indicator element with shape
   */
  static createColorIndicator(fileId: string, colorHex: string): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      width: 12px;
      height: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const shape = this.getShapeType(fileId);
    const svg = this.createShapeSVG(shape, colorHex);
    container.appendChild(svg);

    return container;
  }

  /**
   * Create simple square color chip (for WAV files)
   */
  static createSquareColorChip(colorHex: string): HTMLElement {
    const chip = document.createElement("div");
    chip.style.cssText = `
      width: 12px;
      height: 12px;
      border-radius: 2px;
      border: 1px solid var(--ui-border);
      background: ${colorHex};
      flex-shrink: 0;
    `;
    return chip;
  }
}