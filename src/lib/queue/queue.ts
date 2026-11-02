/**
 * Job queue abstraction. Drivers:
 *  - memory (default, sandbox/dev): in-process worker loop, DB-backed status.
 *  - bullmq (production): Redis-backed via docker-compose worker service.
 * The driver is selected by QUEUE_DRIVER env. All jobs live in the BuildJob
 * table so status/progress/logs survive restarts and are visible in the UI.
 */

export type JobHandler = (jobId: string) => Promise<void>;

export interface QueueDriver {
  name: string;
  start(handler: JobHandler): Promise<void>;
  enqueue(jobId: string): Promise<void>;
}

const g = globalThis as unknown as {
  __efQueue?: QueueDriver;
  __efQueueHandler?: JobHandler;
  __efQueuePending?: string[];
};

async function memoryDriver(): Promise<QueueDriver> {
  const { memoryQueue } = await import('./memory');
  return memoryQueue;
}

async function bullmqDriver(): Promise<QueueDriver> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL required for bullmq driver');
  const { createBullmqQueue } = await import('./bullmq');
  return createBullmqQueue(url);
}

export async function getQueue(): Promise<QueueDriver> {
  if (g.__efQueue) return g.__efQueue;
  const preferred = process.env.QUEUE_DRIVER;
  let driver: QueueDriver;
  if (preferred === 'bullmq') driver = await bullmqDriver();
  else driver = await memoryDriver();
  g.__efQueue = driver;
  return driver;
}

export async function startWorker(handler: JobHandler): Promise<void> {
  g.__efQueueHandler = handler;
  const queue = await getQueue();
  await queue.start(handler);
}

export async function enqueueJob(jobId: string): Promise<void> {
  const queue = await getQueue();
  await queue.enqueue(jobId);
}
