// Runs tasks one at a time, in the order they were added; a failed task never blocks the next.
// The results cards use one queue, so a screen with several Share card buttons draws them in turn.
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}
