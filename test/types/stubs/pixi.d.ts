declare module "pixi.js" {
  namespace PIXI {
    class Application { constructor(...args: any[]); init?: any; renderer: any; canvas: any; stage: any; destroy?: any; }
    class Container { addChild(...args: any[]): any; removeChild(...args: any[]): any; zIndex?: number; mask?: any; sortableChildren?: boolean; }
    class Graphics { clear(): any; rect(...args: any[]): any; fill(...args: any[]): any; zIndex?: number; destroy?: any; }
    class Sprite { static from?: any; x: number; y: number; width: number; height: number; tint: any; alpha: any; blendMode: any; zIndex?: number; }
    class Text {}
    class TilingSprite {}
    class FederatedPointerEvent {}
  }
  const PIXIExport: typeof PIXI & any;
  export = PIXIExport;
}
