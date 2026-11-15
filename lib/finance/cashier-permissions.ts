import { z } from 'zod';
export const cashierPermissionsSchema = z.object({ createItem: z.boolean(), createSupplier: z.boolean(), credit: z.boolean(), supplierPayout: z.boolean() }).strict();
export type CashierPermissions = z.infer<typeof cashierPermissionsSchema>;
export const defaultCashierPermissions: CashierPermissions = { createItem: false, createSupplier: false, credit: false, supplierPayout: false };
