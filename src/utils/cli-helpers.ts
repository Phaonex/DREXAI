/**
 * Safe Iterator/Generator Pattern. Emits data slices lazily without matrix iteration logic.
 * Ensures the input array is partitioned into immutable batches of a fixed size.
 */
export function* chunkIterator<T>(items: readonly T[], size: number): Generator<readonly T[]> {
  if (size <= 0) return;
  const numBatches = Math.ceil(items.length / size);
  yield* Array.from({ length: numBatches }, (_, i) => 
    Object.freeze(items.slice(i * size, (i + 1) * size))
  );
}

/**
 * Parses a range string (e.g., "1-5" or "-1-10") into a start and end object.
 * Returns null if the format is invalid.
 */
export function parseRange(range: string): { start: number; end: number } | null {
  const match = range.match(/^(-?\d+)-(-?\d+)$/);
  if (!match) return null;
  
  const start = Number(match[1]);
  const end = Number(match[2]);

  return { start, end };
}
