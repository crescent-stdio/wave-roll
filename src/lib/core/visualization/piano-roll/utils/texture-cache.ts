/**
 * Texture caching system for piano roll rendering
 */

import * as PIXI from 'pixi.js';

/**
 * Centralized texture cache manager
 */
export class TextureCache {
  private static caches = new Map<string, Map<string, PIXI.Texture>>();

  /**
   * Get or create a texture from cache
   */
  static getTexture(
    category: string,
    key: string,
    generator: () => PIXI.Texture
  ): PIXI.Texture {
    // Get or create category cache
    if (!this.caches.has(category)) {
      this.caches.set(category, new Map());
    }
    
    const categoryCache = this.caches.get(category)!;
    
    // Get or generate texture
    if (!categoryCache.has(key)) {
      const texture = generator();
      categoryCache.set(key, texture);
      return texture;
    }
    
    return categoryCache.get(key)!;
  }

  /**
   * Check if a texture exists in cache
   */
  static hasTexture(category: string, key: string): boolean {
    const categoryCache = this.caches.get(category);
    return categoryCache ? categoryCache.has(key) : false;
  }

  /**
   * Remove a specific texture from cache
   */
  static removeTexture(category: string, key: string): void {
    const categoryCache = this.caches.get(category);
    if (categoryCache) {
      const texture = categoryCache.get(key);
      if (texture) {
        texture.destroy(true);
        categoryCache.delete(key);
      }
    }
  }

  /**
   * Clear a specific category cache
   */
  static clearCategory(category: string): void {
    const categoryCache = this.caches.get(category);
    if (categoryCache) {
      categoryCache.forEach(texture => texture.destroy(true));
      categoryCache.clear();
      this.caches.delete(category);
    }
  }

  /**
   * Clear all caches
   */
  static clearAll(): void {
    this.caches.forEach((categoryCache, category) => {
      categoryCache.forEach(texture => texture.destroy(true));
      categoryCache.clear();
    });
    this.caches.clear();
  }

  /**
   * Get all textures in a category
   */
  static getCategoryTextures(category: string): Map<string, PIXI.Texture> | undefined {
    return this.caches.get(category);
  }

  /**
   * Get cache statistics
   */
  static getStats(): { categories: number; totalTextures: number } {
    let totalTextures = 0;
    this.caches.forEach(categoryCache => {
      totalTextures += categoryCache.size;
    });
    
    return {
      categories: this.caches.size,
      totalTextures
    };
  }
}

/**
 * Create a category-specific texture cache helper
 */
export function createTextureCacheHelper(category: string) {
  return {
    get: (key: string, generator: () => PIXI.Texture) =>
      TextureCache.getTexture(category, key, generator),
    
    has: (key: string) =>
      TextureCache.hasTexture(category, key),
    
    remove: (key: string) =>
      TextureCache.removeTexture(category, key),
    
    clear: () =>
      TextureCache.clearCategory(category),
    
    getAll: () =>
      TextureCache.getCategoryTextures(category)
  };
}