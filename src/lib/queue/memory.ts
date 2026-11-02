import { db } from '@/lib/db';
import type { JobHandler } from './queue';

/**
 * In-process memory driver. Concurrency 1, no external deps. Jobs are taken
 * from the DB queue (status=queued) so nothing is lost on restart; the loop
 * also picks up jobs enqueued by other requests in this process.
 */

const g = globalThis as unknown as {
  __efMemQueue?: { running: boolean; handler: JobHandler | null };
};

const state = (g.__efMemQueue ??= { running: false, handler: null });

async function tick() {
  if (!state.handler) return;
  // claim one queued job (single process → safe)
  const job = await db.buildJob.findFirst({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
  });
  if (!job) return;
  // re-check claimed status to avoid double-run across overlapping ticks
  const claimed = await db.buildJob.updateMany({
    where: { id: job.id, status: 'queued' },
    data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return;
  try {
    await state.handler(job.id);
  } catch (err) {
    console.error('[worker] job failed', job.id, err);
    await db.buildJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: (err as Error).message.slice(0, 2000), finishedAt: new Date() },
    }).catch(() => {});
  }
}

export const memoryQueue = {
  name: 'memory',
  async start(handler: JobHandler) {
    state.handler = handler;
    if (state.running) return;
    state.running = true;
    setInterval(() => { tick().catch(e => console.error('[worker:tick]', e)); }, 1000);
    // Unblock jobs that were queued before a restart
    setTimeout(() => tick().catch(() => {}), 500);
  },
  async enqueue(jobId: string) {
    void jobId; // memory driver polls the DB queue

    // Long-running hosts: the setInterval loop in start() picks the job up
    // within ~1s — but on serverless (Vercel) that interval freezes once the
    // HTTP response is sent, and the job would sit "queued" forever.
    // Kick one tick immediately...
    setTimeout(() => { tick().catch((e) => console.error('[worker:kick]', e)); }, 0);

    // ...and one after the response finishes. Next.js `after()` keeps this
    // invocation alive on Vercel to run post-response work. Outside a request
    // scope (worker container, vitest) the dynamic import/after() throws —
    // the setTimeout kick above already covers those environments.
    try {
      const { after } = await import('next/server');
      after(() => tick().catch((e) => console.error('[worker:after]', e)));
    } catch {
      /* not in a request scope — interval/kick handles it */
    }
  },
};
