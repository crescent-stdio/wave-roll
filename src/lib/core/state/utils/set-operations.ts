/**
 * Set-based operations for managing collections (e.g., file visibility)
 */

/**
 * Generic set manager for handling add/remove/toggle operations
 */
export class SetManager<T> {
  private set: Set<T>;
  private onUpdate: (set: Set<T>) => void;

  constructor(initialSet: Set<T> = new Set(), onUpdate?: (set: Set<T>) => void) {
    this.set = new Set(initialSet);
    this.onUpdate = onUpdate || (() => {});
  }

  add(item: T): void {
    this.set.add(item);
    this.onUpdate(this.set);
  }

  remove(item: T): void {
    this.set.delete(item);
    this.onUpdate(this.set);
  }

  toggle(item: T): boolean {
    const exists = this.set.has(item);
    if (exists) {
      this.remove(item);
    } else {
      this.add(item);
    }
    return !exists;
  }

  has(item: T): boolean {
    return this.set.has(item);
  }

  clear(): void {
    this.set.clear();
    this.onUpdate(this.set);
  }

  sync(items: T[]): void {
    this.set = new Set(items);
    this.onUpdate(this.set);
  }

  get size(): number {
    return this.set.size;
  }

  get values(): Set<T> {
    return new Set(this.set);
  }
}

/**
 * Create a set manager with automatic state synchronization
 */
export function createSyncedSetManager<T>(
  getSet: () => Set<T>,
  updateState: (updates: { visibleFileIds?: Set<T>; totalFiles?: number }) => void
): SetManager<T> {
  return new SetManager(getSet(), (set) => {
    updateState({
      visibleFileIds: set as Set<T>,
      totalFiles: set.size,
    });
  });
}