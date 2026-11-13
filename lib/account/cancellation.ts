import { z } from 'zod';

export const cancellationInput = z.object({
  cafeId: z.uuid(),
  confirmation: z.string().trim().min(1).max(120),
  reason: z.string().trim().max(1000),
  password: z.string().min(1).max(128),
  requestId: z.uuid(),
}).strict();
export type BrandCancellation = { actorId: string; actorName: string; cancelledAt: string; origin: 'user'; reason: string };
export type CancellationBrand = { id: string; slug: string; name: string; cancelledAt: string | null };
