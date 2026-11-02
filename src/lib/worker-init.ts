import { processJob } from '@/lib/pipeline/build';
import { startWorker } from '@/lib/queue/queue';

/**
 * Lazy worker bootstrap for the embedded (memory) queue driver.
 * Idempotent for the DRIVER, but always re-registers the handler so hot
 * module reloads (dev) pick up the latest pipeline code.
 * In production with QUEUE_DRIVER=bullmq the dedicated worker container
 * calls the same startWorker(processJob) entrypoint.
 */
const g = globalThis as unknown as { __efWorkerStarted?: boolean };

export async function ensureWorker(): Promise<void> {
  try {
    // Re-register on every call: cheap for memory driver (updates handler),
    // no-op-safe for bullmq (guarded inside its start()).
    await startWorker(processJob);
    g.__efWorkerStarted = true;
  } catch (err) {
    console.error('[worker] failed to start:', err);
  }
}
