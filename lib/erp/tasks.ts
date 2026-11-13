import { z } from "zod";
import {taskNoteInputSchema} from './task-notes';

export const taskPriorities = { low: "منخفضة", medium: "متوسطة", high: "مرتفعة", urgent: "عاجلة" } as const;
export const taskStatuses = { pending: "قيد الانتظار", in_progress: "قيد التنفيذ", completed: "مكتملة", cancelled: "ملغاة" } as const;
export {taskTargets} from "./task-targets";
import {taskTargets,taskTargetKeys} from "./task-targets";
const id = z.uuid();
const optionalId = id.nullable().default(null);
const text = (max: number) => z.string().trim().max(max);
const shortName = text(200).min(1, "أدخل الاسم");
const target = z.enum(taskTargetKeys);
export const taskInputSchema = z.object({
  id: optionalId, revision: z.number().int().nonnegative().default(0), title: shortName,
  code: text(50).default(""), priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  typeId: id, assigneeId: id, dueDate: z.iso.date().nullable().default(null), description: text(20000).default(""),
  targetKind: target.nullable().default(null), targetId: optionalId,
}).strict().refine(v => Boolean(v.targetKind) === Boolean(v.targetId), { message: "اختر القسم والسجل المرتبط معًا", path: ["targetId"] });
export type TaskInput = z.infer<typeof taskInputSchema>;
export const taskTypeInputSchema = z.object({ id: optionalId, revision: z.number().int().nonnegative().default(0), name: shortName, active: z.boolean().default(true), description: text(20000).default("") }).strict();
export const taskFlowLineSchema = z.object({ title: shortName, description: text(20000).default(""), typeId: id, priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"), assigneeId: optionalId, dueDays: z.number().int().min(0).max(3650).default(0), targetKind: target.nullable().default(null), targetId: optionalId }).strict().refine(v => Boolean(v.targetKind) === Boolean(v.targetId), { message: "اختر القسم والسجل المرتبط معًا" });
export const taskFlowInputSchema = z.object({ id: optionalId, revision: z.number().int().nonnegative().default(0), code: text(50).default(""), name: shortName, assigneeId: optionalId, templateId: optionalId, description: text(20000).default(""), active: z.boolean().default(true), lines: z.array(taskFlowLineSchema).min(1, "أضف مهمة واحدة على الأقل").max(100) }).strict();
export type TaskFlowInput = z.infer<typeof taskFlowInputSchema>;
export const taskActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), data: taskInputSchema }),
  z.object({ action: z.literal("save_type"), data: taskTypeInputSchema }),
  z.object({ action: z.literal("save_template"), data: taskFlowInputSchema }),
  z.object({ action: z.literal("save_flow"), data: taskFlowInputSchema.refine(v => v.assigneeId !== null, "اختر موظف المسار") }),
  z.object({ action: z.literal("status"), data: z.object({ id, revision: z.number().int().positive(), status: z.enum(["pending", "in_progress", "completed", "cancelled"]) }).strict() }),
  z.object({ action: z.literal("assign"), data: z.object({ id, revision: z.number().int().positive(), assigneeId: id }).strict() }),
  z.object({ action: z.literal("link"), data: z.object({ id, revision: z.number().int().positive(), targetKind: target.nullable(), targetId: id.nullable() }).strict().refine(v => Boolean(v.targetKind) === Boolean(v.targetId), "اختر القسم والسجل معًا") }),
  z.object({ action: z.literal("note"), data: taskNoteInputSchema }),
  z.object({ action: z.literal("delete"), data: z.object({ id, revision: z.number().int().positive(), kind: z.enum(["task", "type", "template", "flow"]) }).strict() }),
  z.object({ action: z.literal("settings"), data: z.object({ revision: z.number().int().nonnegative(), enabledTargets: z.array(target).max(taskTargetKeys.length) }).strict() }),
]);
export type TaskAction = z.infer<typeof taskActionSchema>;
export type TaskRecord = { id: string; number: number; code: string; title: string; type_id: string; type_name: string; assignee_id: string; assignee_name: string; priority: keyof typeof taskPriorities; status: keyof typeof taskStatuses; due_date: string | null; description: string; target_kind: keyof typeof taskTargets | null; target_id: string | null; target_name: string | null; flow_id: string | null; revision: number; created_at: string; updated_at: string };
export type TaskType = { id: string; name: string; active: boolean; description: string; revision: number; created_at: string };
export type TaskTemplate = { id: string; name: string; description: string; active: boolean; lines: TaskFlowInput["lines"]; revision: number; created_at: string };
export type TaskFlow = { id: string; number: number; code: string; name: string; assignee_id: string; assignee_name: string; description: string; revision: number; created_at: string; total: number; completed: number; due_date: string | null; started_at: string | null; status: keyof typeof taskStatuses };
export type TaskEvent = { id: string; task_id: string | null; flow_id: string | null; actor_name: string; action: string; detail: Record<string, unknown>; created_at: string };
export type TaskNote = { id: string; task_id: string; note: string; occurred_at: string; actor_name: string; note_format?:'plain'|'rich';tags?:string[] };
export type TaskSnapshot = { tasks: TaskRecord[]; total: number; page: number; types: TaskType[]; templates: TaskTemplate[]; flows: TaskFlow[]; events: TaskEvent[]; notes: TaskNote[]; staff: { id: string; name: string }[]; settings: { revision: number; enabledTargets: (keyof typeof taskTargets)[] }; canWrite: boolean; canConfigure: boolean };
export const taskQuerySchema = z.object({ page: z.number().int().min(1).max(100000).default(1), query: text(120).default(""), status: z.union([z.literal(""), z.enum(["pending", "in_progress", "completed", "cancelled"])]).default(""), priority: z.union([z.literal(""), z.enum(["low", "medium", "high", "urgent"])]).default(""), typeId: optionalId, assigneeId: optionalId, flowId: optionalId, id: optionalId, sort: z.enum(["newest", "oldest", "due", "title"]).default("newest") }).strict();
export type TaskQuery = z.infer<typeof taskQuerySchema>;

export function canTransitionTask(from: keyof typeof taskStatuses, to: keyof typeof taskStatuses) {
  return ({ pending: ["in_progress", "cancelled"], in_progress: ["completed", "pending", "cancelled"], completed: ["in_progress"], cancelled: ["pending"] } as Record<string, string[]>)[from].includes(to);
}
