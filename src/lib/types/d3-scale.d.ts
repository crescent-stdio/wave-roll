declare module "d3-scale" {
  /**
   * Minimal generic interface for a D3 linear scale.
   * Covers the small subset of members used in the project (domain / range getter-setters).
   */
  export interface ScaleLinear<
    Domain = number,
    Range = number,
    Unknown = never,
  > {
    (value: Domain): Range;
    /** Returns the current domain. */
    domain(): Domain[];
    /** Sets the domain and returns this scale. */
    domain(domain: Iterable<Domain>): this;

    /** Returns the current range. */
    range(): Range[];
    /** Sets the range and returns this scale. */
    range(range: Iterable<Range>): this;

    /**
     * Returns the domain value corresponding to the supplied range value.
     * Commonly used for coordinate ↔︎ data conversions (e.g. x -> time).
     */
    invert(value: Range): Domain;
  }

  /**
   * Factory for a linear scale.
   */
  export function scaleLinear<D = number, R = number, U = never>(): ScaleLinear<
    D,
    R,
    U
  >;
}
