import { z } from "zod";

export const workshopStatuses = ["requested", "preparing", "prepared", "out_for_delivery", "delivered", "cancelled"] as const;
export type WorkshopStatus = typeof workshopStatuses[number];
export type WorkshopProduct = { id: string; name: string; sku: string; barcode: string | null; unit: string; flavor: string; shape: string; packaging: string; imageUrl?: string | null };
export type WorkshopOrder = {
  id: string; number: number; revision: number; branchId: string; branchName: string; status: WorkshopStatus;
  requiredAt: string; notes: string; createdAt: string; updatedAt: string; createdByName: string;
  lines: (WorkshopProduct & { quantity: number })[];
  events: { id: string; status: WorkshopStatus; note: string; at: string; actorName: string }[];
};
export type WorkshopSnapshot = {
  canCreate: boolean; canPrepare: boolean; canReceive: boolean;
  branches: { id: string; name: string }[]; products: WorkshopProduct[];
  orders: WorkshopOrder[]; total: number; offset: number; pageSize: number; productCount: number; productLimit: number;
  legacyOrders: { id: string; number: number; status: string; branchName: string; customerName: string; requiredAt: string; notes: string; lines: { name: string; quantity: number }[] }[]; legacyTotal: number; legacyOffset: number;
};
export const workshopReadSchema = z.object({ branchId: z.uuid().nullable().default(null), status: z.enum(workshopStatuses).nullable().default(null), query: z.string().trim().max(100).default(""), searchField: z.enum(["all", "name", "barcode", "sku", "flavor", "shape", "packaging"]).default("all"), offset: z.number().int().min(0).max(100000).default(0), legacyOffset: z.number().int().min(0).max(100000).default(0) }).strict();
export const workshopCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), requestId: z.uuid(), id: z.uuid(), branchId: z.uuid(), requiredAt: z.iso.datetime({ offset: true }), notes: z.string().trim().max(2000).default(""), lines: z.array(z.object({ itemId: z.uuid(), quantity: z.number().finite().positive().max(100000).multipleOf(0.001) }).strict()).min(1).max(100) }).strict(),
  z.object({ action: z.literal("status"), requestId: z.uuid(), id: z.uuid(), revision: z.number().int().positive(), status: z.enum(workshopStatuses), note: z.string().trim().max(2000).default("") }).strict(),
]);
export type WorkshopCommand = z.infer<typeof workshopCommandSchema>;
