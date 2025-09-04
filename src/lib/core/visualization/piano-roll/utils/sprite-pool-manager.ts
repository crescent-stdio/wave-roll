/**
 * Sprite pool management for efficient rendering
 */

import * as PIXI from 'pixi.js';

/**
 * Generic sprite pool manager for reusing display objects
 */
export class SpritePoolManager<T extends { visible: boolean; destroy: () => void }> {
  private pool: T[] = [];
  
  constructor(
    private factory: () => T,
    private container: PIXI.Container,
    private onSetup?: (sprite: T, index: number) => void
  ) {}

  /**
   * Resize the pool to match target size
   */
  resizePool(targetSize: number): T[] {
    // Expand pool if needed
    while (this.pool.length < targetSize) {
      const sprite = this.factory();
      this.container.addChild(sprite as any);
      this.pool.push(sprite);
      
      if (this.onSetup) {
        this.onSetup(sprite, this.pool.length - 1);
      }
    }
    
    // Shrink pool if needed
    while (this.pool.length > targetSize) {
      const sprite = this.pool.pop();
      if (sprite) {
        this.container.removeChild(sprite as any);
        sprite.destroy();
      }
    }
    
    return this.pool;
  }

  /**
   * Get a sprite at specific index
   */
  getSprite(index: number): T | undefined {
    return this.pool[index];
  }

  /**
   * Get all sprites in the pool
   */
  getAllSprites(): T[] {
    return [...this.pool];
  }

  /**
   * Update all sprites with a callback
   */
  updateAll(callback: (sprite: T, index: number) => void): void {
    this.pool.forEach((sprite, index) => {
      callback(sprite, index);
    });
  }

  /**
   * Hide sprites beyond a certain index
   */
  hideAfterIndex(index: number): void {
    for (let i = index; i < this.pool.length; i++) {
      const sprite = this.pool[i];
      if (sprite) {
        sprite.visible = false;
      }
    }
  }

  /**
   * Show all sprites
   */
  showAll(): void {
    this.pool.forEach(sprite => {
      sprite.visible = true;
    });
  }

  /**
   * Get current pool size
   */
  get size(): number {
    return this.pool.length;
  }

  /**
   * Clear and destroy all sprites
   */
  destroyPool(): void {
    while (this.pool.length > 0) {
      const sprite = this.pool.pop();
      if (sprite) {
        this.container.removeChild(sprite as any);
        sprite.destroy();
      }
    }
  }
}

/**
 * Helper to create a sprite pool for PIXI.Sprite
 */
export function createSpritePool(
  container: PIXI.Container,
  texture?: PIXI.Texture,
  onSetup?: (sprite: PIXI.Sprite, index: number) => void
): SpritePoolManager<PIXI.Sprite> {
  return new SpritePoolManager(
    () => new PIXI.Sprite(texture),
    container,
    onSetup
  );
}

/**
 * Helper to create a sprite pool for PIXI.Graphics
 */
export function createGraphicsPool(
  container: PIXI.Container,
  onSetup?: (graphics: PIXI.Graphics, index: number) => void
): SpritePoolManager<PIXI.Graphics> {
  return new SpritePoolManager(
    () => new PIXI.Graphics(),
    container,
    onSetup
  );
}
