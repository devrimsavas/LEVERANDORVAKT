// Runs fn for every item, at most `limit` at a time, and returns the
// results in the order of the items. Keeps the number of requests to an
// outside API at the same time small.
//
// If one item fails, no new item is started, and the error is passed on
// only once the items already running have finished. So nothing keeps
// working in the background after the caller has its answer: no requests
// nobody waits for, and no late writes (for example to a cache).
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failed = false;

  async function worker(): Promise<void> {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index]!);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  const outcomes = await Promise.allSettled(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  const rejected = outcomes.find(
    (outcome): outcome is PromiseRejectedResult =>
      outcome.status === "rejected",
  );
  if (rejected) {
    throw rejected.reason;
  }
  return results;
}
