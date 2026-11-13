import { z } from 'zod';
import { safeErpRichText } from './custom-fields';
import { taskNoteHasText } from './task-notes';

export const manufacturingNoteFields = {
  format: z.enum(['plain', 'rich']).optional(),
  tags: z.array(z.string().trim().min(1).max(80).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'الوسم يحتوي على محارف غير صالحة')).max(20).optional(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  attachmentIds: z.array(z.uuid()).max(20).optional(),
};

type NoteAction = { action: string; note: string; format?: 'plain' | 'rich'; tags?: string[]; occurredAt?: string; attachmentIds?: string[] };
export function validateManufacturingNote(value: NoteAction, context: z.RefinementCtx) {
  if (value.action !== 'note') return;
  const content = value.format === 'rich' ? safeErpRichText(value.note) : value.note.trim();
  if (!content.trim() || value.format === 'rich' && !taskNoteHasText(content) || content.length > 10000) {
    context.addIssue({ code: 'custom', path: ['note'], message: 'أدخل ملاحظة واضحة لا تتجاوز عشرة آلاف حرف' });
  }
  if (new Set(value.tags?.map(tag => tag.toLocaleLowerCase('en-US'))).size !== (value.tags?.length ?? 0)) {
    context.addIssue({ code: 'custom', path: ['tags'], message: 'احذف الوسوم المتكررة' });
  }
  if (new Set(value.attachmentIds).size !== (value.attachmentIds?.length ?? 0)) {
    context.addIssue({ code: 'custom', path: ['attachmentIds'], message: 'احذف المرفقات المتكررة' });
  }
}
export function normalizeManufacturingNote<T extends NoteAction>(value: T): T {
  return value.action === 'note' && value.format === 'rich' ? { ...value, note: safeErpRichText(value.note) } : value;
}

export function manufacturingNoteDate(value = new Date()): string {
  return new Date(value.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
export function manufacturingNoteTimestamp(value: string): string {
  const parsed = z.iso.datetime({ local: true }).safeParse(value.length === 16 ? value + ':00' : value);
  if (!parsed.success) throw new Error('أدخل تاريخ الملاحظة ووقتها');
  return new Date(parsed.data + '+03:00').toISOString();
}
