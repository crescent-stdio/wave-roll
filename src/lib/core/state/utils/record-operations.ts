/**
 * Record/Map operations for state management
 */

/**
 * Manager for Record-based collections (e.g., file handlers)
 */
export class RecordManager<T> {
  private record: Record<string, T>;
  private onUpdate?: (record: Record<string, T>) => void;

  constructor(
    initialRecord: Record<string, T> = {},
    onUpdate?: (record: Record<string, T>) => void
  ) {
    this.record = { ...initialRecord };
    this.onUpdate = onUpdate;
  }

  /**
   * Set a value in the record
   */
  set(key: string, value: T): void {
    this.record[key] = value;
    this.notifyUpdate();
  }

  /**
   * Get a value from the record
   */
  get(key: string): T | undefined {
    return this.record[key];
  }

  /**
   * Remove a key from the record
   */
  remove(key: string): void {
    delete this.record[key];
    this.notifyUpdate();
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    return key in this.record;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.record = {};
    this.notifyUpdate();
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Object.keys(this.record);
  }

  /**
   * Get all values
   */
  values(): T[] {
    return Object.values(this.record);
  }

  /**
   * Get all entries
   */
  entries(): [string, T][] {
    return Object.entries(this.record);
  }

  /**
   * Iterate over all values
   */
  forEach(callback: (value: T, key: string) => void): void {
    Object.entries(this.record).forEach(([key, value]) => {
      callback(value, key);
    });
  }

  /**
   * Apply a function to all values
   */
  mapValues<U>(mapper: (value: T, key: string) => U): Record<string, U> {
    const result: Record<string, U> = {};
    this.forEach((value, key) => {
      result[key] = mapper(value, key);
    });
    return result;
  }

  /**
   * Filter entries
   */
  filter(predicate: (value: T, key: string) => boolean): Record<string, T> {
    const result: Record<string, T> = {};
    this.forEach((value, key) => {
      if (predicate(value, key)) {
        result[key] = value;
      }
    });
    return result;
  }

  /**
   * Get the underlying record (immutable copy)
   */
  toRecord(): Record<string, T> {
    return { ...this.record };
  }

  /**
   * Get the number of entries
   */
  get size(): number {
    return this.keys().length;
  }

  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate(this.toRecord());
    }
  }
}

/**
 * Helper to merge multiple records
 */
export function mergeRecords<T>(
  ...records: Record<string, T>[]
): Record<string, T> {
  return Object.assign({}, ...records);
}

/**
 * Helper to filter a record
 */
export function filterRecord<T>(
  record: Record<string, T>,
  predicate: (value: T, key: string) => boolean
): Record<string, T> {
  const result: Record<string, T> = {};
  Object.entries(record).forEach(([key, value]) => {
    if (predicate(value, key)) {
      result[key] = value;
    }
  });
  return result;
}

/**
 * Helper to map record values
 */
export function mapRecordValues<T, U>(
  record: Record<string, T>,
  mapper: (value: T, key: string) => U
): Record<string, U> {
  const result: Record<string, U> = {};
  Object.entries(record).forEach(([key, value]) => {
    result[key] = mapper(value, key);
  });
  return result;
}