/**
 * Production worker entrypoint (docker/worker container).
 * Boots the BullMQ-backed queue and the build pipeline.
 */
import { startWorker } from '../src/lib/queue/queue';
import { processJob } from '../src/lib/pipeline/build';

startWorker(processJob)
  .then(() => console.log('[worker] ElementorForge worker started (bullmq)'))
  .catch(err => {
    console.error('[worker] failed to start:', err);
    process.exit(1);
  });
