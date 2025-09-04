/**
 * State change handling utilities for playback module
 */

/**
 * Creates a state change handler that tracks before/after states
 */
export function createStateChangeHandler<T>(
  getCurrentState: () => T,
  onStateChange: (prevState: T, newState: T) => void
) {
  return (updateFn: () => void) => {
    const prevState = getCurrentState();
    updateFn();
    const newState = getCurrentState();
    
    if (prevState !== newState) {
      onStateChange(prevState, newState);
    }
  };
}

/**
 * Creates a batch state change handler that accumulates changes
 */
export function createBatchStateHandler<T>(
  getCurrentState: () => T,
  onBatchComplete: (changes: T[]) => void
) {
  const changes: T[] = [];
  let batchTimeout: number | null = null;
  
  return {
    addChange: (updateFn: () => void) => {
      updateFn();
      changes.push(getCurrentState());
      
      if (batchTimeout) {
        clearTimeout(batchTimeout);
      }
      
      batchTimeout = window.setTimeout(() => {
        if (changes.length > 0) {
          onBatchComplete([...changes]);
          changes.length = 0;
        }
        batchTimeout = null;
      }, 16); // One frame delay
    },
    
    flush: () => {
      if (batchTimeout) {
        clearTimeout(batchTimeout);
        batchTimeout = null;
      }
      
      if (changes.length > 0) {
        onBatchComplete([...changes]);
        changes.length = 0;
      }
    }
  };
}

/**
 * State comparison utilities
 */
export const StateComparison = {
  /**
   * Check if two states are equal (shallow comparison)
   */
  areEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    return keysA.every(key => a[key] === b[key]);
  },

  /**
   * Get changed properties between two states
   */
  getChangedProperties<T extends Record<string, unknown>>(
    prevState: T,
    newState: T
  ): Partial<T> {
    const changes: Partial<T> = {};
    
    for (const key in newState) {
      if (prevState[key] !== newState[key]) {
        changes[key] = newState[key];
      }
    }
    
    return changes;
  },

  /**
   * Check if specific properties changed
   */
  hasPropertiesChanged<T extends Record<string, unknown>>(
    prevState: T,
    newState: T,
    properties: (keyof T)[]
  ): boolean {
    return properties.some(prop => prevState[prop] !== newState[prop]);
  }
};