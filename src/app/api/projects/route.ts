import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handle, json, readJson, rateLimit, clientIp } from '@/lib/api';
import { ValidationError, NotFoundError, ForbiddenError, InsufficientCreditsError } from '@/lib/errors';
import { reserve, costForBuild, getBalance } from '@/lib/credits';
import { enqueueJob } from '@/lib/queue/queue';
import { ensureWorker } from '@/lib/worker-init';
import { onboardUser, getUserEntitlements } from '@/lib/plans';
import { audit } from '@/lib/audit';
import { randomUUID } from 'crypto';

// Serverless: allow the AI build/pairing work to finish (Vercel Hobby max = 60s)
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const projects = await db.project.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        site: { select: { name: true, url: true, mode: true } },
        _count: { select: { generatedPages: true } },
      },
    });
    return json({
      projects: projects.map(p => ({
        id: p.id, name: p.name, status: p.status,
        businessName: p.businessName, industry: p.industry,
        site: p.site, pageCount: p._count.generatedPages,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    rateLimit(`build:${clientIp(req)}`, 6, 60_000);
    await onboardUser(user.id);

    const body = await readJson<{
      siteId?: string; name?: string; businessName?: string; industry?: string;
      description?: string; email?: string; city?: string; audience?: string;
      pages?: string[]; designInstructions?: string; referenceUrl?: string;
    }>(req);

    if (!body.siteId) throw new ValidationError('siteId is required');
    if (!body.name?.trim()) throw new ValidationError('Project name is required');
    if (!body.businessName?.trim()) throw new ValidationError('Business name is required');
    if (!body.description?.trim() || body.description.trim().length < 20) {
      throw new ValidationError('Business description must be at least 20 characters so the AI can work with it');
    }
    const pages = (body.pages ?? ['Home']).filter(p => typeof p === 'string' && p.trim()).slice(0, 10);
    if (!pages.length) throw new ValidationError('Select at least one page');
    if (body.referenceUrl && !/^https?:\/\//i.test(body.referenceUrl)) {
      throw new ValidationError('Reference URL must start with http(s)://');
    }

    const site = await db.site.findUnique({ where: { id: body.siteId } });
    if (!site) throw new NotFoundError('Site not found');
    if (site.userId !== user.id) throw new ForbiddenError('Not your site');
    if (site.status !== 'connected') {
      throw new ValidationError(`Site "${site.name}" is not connected yet (status: ${site.status}). Complete pairing or run diagnostics first.`);
    }

    // Server-side credit enforcement: reserve BEFORE creating the job.
    const cost = costForBuild(pages.length);
    const balance = await getBalance(user.id);
    if (balance < cost) throw new InsufficientCreditsError(balance, cost);

    const idempotencyKey = `job:${randomUUID()}`; // client-driven dedupe happens via job creation below
    const job = await db.$transaction(async tx => {
      const project = await tx.project.create({
        data: {
          userId: user.id,
          siteId: site.id,
          name: body.name!.trim().slice(0, 120),
          businessName: body.businessName!.trim().slice(0, 120),
          industry: body.industry?.trim().slice(0, 80) ?? null,
          brief: JSON.stringify({
            businessName: body.businessName!.trim(),
            industry: body.industry?.trim() ?? '',
            description: body.description!.trim(),
            email: body.email?.trim() ?? '',
            city: body.city?.trim() ?? '',
            audience: body.audience?.trim() ?? '',
          }),
          referenceUrl: body.referenceUrl?.trim() ?? null,
          designInstructions: body.designInstructions?.trim().slice(0, 4000) ?? null,
          pages: JSON.stringify(pages),
          status: 'building',
        },
      });
      return tx.buildJob.create({
        data: {
          projectId: project.id,
          siteId: site.id,
          type: 'build_site',
          status: 'queued',
          reservedCredits: cost,
          idempotencyKey,
        },
      });
    });

    await reserve(user.id, cost, job.id);
    await ensureWorker();
    await enqueueJob(job.id);
    await audit({ userId: user.id, siteId: site.id, action: 'build.queued', meta: { jobId: job.id, pages: pages.length, cost } });

    return json({ projectId: job.projectId, jobId: job.id, reservedCredits: cost, entitlements: await getUserEntitlements(user.id) }, 201);
  });
}
