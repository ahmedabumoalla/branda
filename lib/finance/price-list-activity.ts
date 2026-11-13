import { z } from "zod";

const value = z.union([z.string().max(80), z.boolean(), z.number().finite().min(0).max(1_000_000_000), z.null()]);
export const priceListActivityPageSchema = z.object({
  items: z.array(z.object({
    id: z.uuid(), revision: z.number().int().positive(), createdAt: z.string(), actor: z.string().max(250),
    action: z.enum(["created", "updated", "deleted"]),
    changes: z.array(z.object({ field: z.enum(["name", "active", "customers", "price"]), productId: z.uuid().nullable(), before: value, after: value }).strict()).max(1003),
  }).strict()).max(30),
  nextCursor: z.number().int().positive().nullable(), limit: z.number().int().min(1).max(30),
}).strict();
export type PriceListActivityPage = z.infer<typeof priceListActivityPageSchema>;
