/**
 * Generic state update utilities for reducing boilerplate
 */

import { AppState } from "../types";

/**
 * Generic state updater that merges partial updates and notifies listeners
 */
export function createStateUpdater<K extends keyof AppState>(
  stateKey: K,
  state: AppState,
  notify: () => void
) {
  return (updates: Partial<AppState[K]>): void => {
    state[stateKey] = { ...state[stateKey], ...updates };
    notify();
  };
}

/**
 * Batch state update wrapper that preserves batch loading state
 */
export function batchStateUpdate<T>(
  state: AppState,
  notify: () => void,
  operation: () => T
): T {
  const prevBatchLoading = state.ui.isBatchLoading;
  state.ui.isBatchLoading = true;

  try {
    return operation();
  } finally {
    state.ui.isBatchLoading = prevBatchLoading;
    if (!prevBatchLoading) notify();
  }
}

/**
 * Deep clone utility for creating initial state
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  
  // Handle primitive types
  if (typeof obj !== 'object') return obj;
  
  // Handle Set
  if (obj instanceof Set) {
    return new Set(obj) as T;
  }
  
  // Handle Map
  if (obj instanceof Map) {
    return new Map(obj) as T;
  }
  
  // Handle Array
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T;
  }
  
  // Handle plain objects
  const cloned = {} as T;
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Create a state property getter
 */
export function createStateGetter<K extends keyof AppState>(
  stateKey: K,
  state: AppState
) {
  return (): AppState[K] => state[stateKey];
}