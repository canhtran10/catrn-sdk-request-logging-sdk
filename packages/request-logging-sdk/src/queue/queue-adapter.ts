import type { CaptureJob } from '../types/capture-job';

/**
 * Pluggable queue: memory (default) or Redis.
 */
export interface QueueAdapter {
  /**
   * @param job - Serialized capture; must not block host for long
   */
  enqueue(job: CaptureJob): void;

  /**
   * @param timeoutMs - Max wait for an item (memory adapter polls)
   * @returns Next job or null if idle/shutdown
   */
  dequeue(timeoutMs: number): Promise<CaptureJob | null>;

  /** Stop dequeue loop (Redis blocking) */
  shutdown?(): void;
}
