import { z } from "zod";

export const invoiceLineNoteSchema = z.object({ id: z.uuid(), text: z.string().min(1, "نص الملاحظة مطلوب").max(50, "الحد الأقصى للملاحظة ٥٠ حرفًا مع المسافات").refine(value => value.trim().length > 0, "نص الملاحظة مطلوب"), active: z.boolean() }).strict();
export const invoiceLineNoteSettingsSchema = z.object({ enabled: z.boolean(), notes: z.array(invoiceLineNoteSchema).max(100, "الحد الأقصى ١٠٠ ملاحظة") }).strict().superRefine((settings, ctx) => {
  const ids = new Set<string>(), texts = new Set<string>();
  settings.notes.forEach((note, index) => {
    const id = note.id.toLowerCase(), text = note.text.trim().toLocaleLowerCase();
    if (ids.has(id) || texts.has(text)) ctx.addIssue({ code: "custom", path: ["notes", index, "text"], message: "لا يمكن تكرار الملاحظة أو معرفها" });
    ids.add(id); texts.add(text);
  });
});
const revision = z.number().int().min(0).max(2_147_483_647);
export const invoiceLineNoteStateSchema = z.object({ settings: invoiceLineNoteSettingsSchema, revision }).strict();
export const invoiceLineNoteOptionsSchema = z.object({ enabled: z.boolean(), notes: z.array(z.object({ id: z.uuid(), text: z.string().min(1).max(50) }).strict()).max(100), revision }).strict();
export type InvoiceLineNoteSettings = z.infer<typeof invoiceLineNoteSettingsSchema>;
export type InvoiceLineNoteState = z.infer<typeof invoiceLineNoteStateSchema>;
export type InvoiceLineNoteOptions = z.infer<typeof invoiceLineNoteOptionsSchema>;

const lineText = z.string().min(1).max(50).refine(value => value.trim().length > 0, "نص الملاحظة مطلوب");
export const invoiceLineNotesSelectionSchema = z.array(z.object({
  key: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), notes: z.array(lineText).min(1).max(10, "الحد الأقصى ١٠ ملاحظات لكل بند"),
}).strict()).max(100).superRefine((lines, ctx) => {
  const keys = new Set<number>();
  lines.forEach((line, index) => {
    if (keys.has(line.key)) ctx.addIssue({ code: "custom", path: [index, "key"], message: "تكرر مفتاح بند الفاتورة" });
    keys.add(line.key);
    if (new Set(line.notes.map(note => note.trim().toLocaleLowerCase())).size !== line.notes.length) ctx.addIssue({ code: "custom", path: [index, "notes"], message: "لا يمكن تكرار الملاحظة داخل البند" });
  });
});
export const invoiceLineNoteContextSchema = z.object({
  enabled: z.boolean(), notes: invoiceLineNoteOptionsSchema.shape.notes, settingsRevision: revision,
  lines: invoiceLineNotesSelectionSchema, revision, hasSelection: z.boolean(), issued: z.boolean(),
}).strict();
export const invoiceLineNoteSelectionInputSchema = z.object({ draftId: z.uuid(), draftRevision: revision.min(1), revision, lines: invoiceLineNotesSelectionSchema }).strict();
export const invoiceLineNoteSelectionSavedSchema = z.object({ revision, lines: invoiceLineNotesSelectionSchema, issued: z.boolean() }).strict();
export const issuedInvoiceLineNotesSchema = z.object({ recorded: z.boolean(), lines: z.array(z.object({ lineIndex: z.number().int().min(0).max(99), key: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), notes: z.array(lineText).min(1).max(10) }).strict()).max(100) }).strict();
export type InvoiceLineNotesSelection = z.infer<typeof invoiceLineNotesSelectionSchema>;
export type InvoiceLineNoteContext = z.infer<typeof invoiceLineNoteContextSchema>;
export type InvoiceLineNoteSelectionInput = z.infer<typeof invoiceLineNoteSelectionInputSchema>;
