import type { CaptureJob } from '../types/capture-job';
import type { QueueAdapter } from './queue-adapter';

type Waiter = (job: CaptureJob | null) => void;

/**
 * FIFO buffer: on overflow drops oldest job. Waiters wake on enqueue or timeout.
 */
export class MemoryQueueAdapter implements QueueAdapter {
  private readonly buffer: CaptureJob[] = [];
  private readonly waiters: Waiter[] = [];

  constructor(private readonly maxSize: number) {}

  enqueue(job: CaptureJob): void {
    if (this.waiters.length > 0) {
      const w = this.waiters.shift()!;
      w(job);
      return;
    }
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push(job);
  }

  dequeue(timeoutMs: number): Promise<CaptureJob | null> {
    const immediate = this.buffer.shift();
    if (immediate) return Promise.resolve(immediate);
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const idx = this.waiters.indexOf(deliver);
        if (idx >= 0) this.waiters.splice(idx, 1);
        resolve(null);
      }, timeoutMs);
      const deliver = (job: CaptureJob | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(job);
      };
      this.waiters.push(deliver);
    });
  }
}
