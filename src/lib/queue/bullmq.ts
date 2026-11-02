import type { JobHandler } from './queue';

/**
 * BullMQ driver for production (Redis). Worker ships as its own container
 * (docker/worker). Guarded dynamic import so dev without Redis never
 * loads bullmq.
 */
export function createBullmqQueue(url: string) {
  let started = false;
  return {
    name: 'bullmq' as const,
    async start(handler: JobHandler) {
      if (started) return; // handler identity is irrelevant to bullmq workers
      started = true;
      const { Worker, Queue } = await import('bullmq');
      const connection = { url };
      const queue = new Queue('elementorforge:builds', { connection });
      const worker = new Worker('elementorforge:builds', async job => handler(String(job.data.jobId)), {
        connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
      });
      worker.on('failed', (job, err) => console.error(`[bullmq] job ${job?.id} failed:`, err.message));
      void queue;
    },
    async enqueue(jobId: string) {
      const { Queue } = await import('bullmq');
      const queue = new Queue('elementorforge:builds', { connection: { url } });
      await queue.add('build', { jobId }, { attempts: 1, removeOnComplete: 500 });
    },
  };
}
