/**
 * Generic listener management for state change callbacks
 */

export class ListenerManager<T extends (...args: any[]) => any = () => void> {
  private listeners: T[] = [];

  /**
   * Add a listener
   */
  add(listener: T): void {
    this.listeners.push(listener);
  }

  /**
   * Remove a listener
   */
  remove(listener: T): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners with error handling
   */
  notify(...args: Parameters<T>): void {
    this.listeners.forEach((listener) => {
      try {
        listener(...args);
      } catch (error) {
        console.error("Error in listener callback:", error);
      }
    });
  }

  /**
   * Clear all listeners
   */
  clear(): void {
    this.listeners = [];
  }

  /**
   * Get listener count
   */
  get count(): number {
    return this.listeners.length;
  }
}
