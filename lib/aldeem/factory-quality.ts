import { z } from "zod";
import { foodStages, foodQualityCommand, type FoodCase, type FoodProgram, type FoodTrace } from "@/lib/erp/aldeem-food-quality";

export type FactoryOrder = { id: string; code: string; name: string; status: string; quantity: number; itemName: string; unit: string; branchId: string | null; branchName: string | null };
export type FactoryQualitySnapshot = {
  canWrite: boolean; canApprove: boolean; branches: { id: string; name: string }[];
  orders: FactoryOrder[]; cases: (FoodCase & { branch_id: string })[]; programs: FoodProgram[];
  legacyCases: (FoodCase & { branch_id: string; legacyLabNumber: number })[];
  events: { id: string; order_id: string | null; action: string; created_at: string; payload: Record<string, unknown> }[];
};
export type FactoryTrace = FoodTrace;
export const factoryQualityCommand = z.union([
  z.object({ action: z.literal("stage"), requestId: z.uuid(), id: z.uuid(), revision: z.number().int().min(0), branchId: z.uuid(), stage: z.enum(foodStages.map(x => x.id)), result: z.enum(["pass", "fail", "na"]), fields: z.array(z.string().trim().max(2000)).length(3), reason: z.string().trim().max(2000) }).strict(),
  foodQualityCommand.options[1],
]);
