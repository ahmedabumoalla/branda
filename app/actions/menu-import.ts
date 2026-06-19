"use server";

import {
  approveMenuImport,
  cancelMenuImport,
  createMenuImportFromPdf,
  createMenuImportFromUrl,
  getMenuImportJob,
  updateMenuImportItems,
} from "@/lib/data/menu-imports";
import type { MenuImportEditableItem } from "@/lib/menu-import/types";

export async function createMenuImportFromUrlAction(sourceUrl: string) {
  return createMenuImportFromUrl(sourceUrl);
}

export async function createMenuImportFromPdfAction(formData: FormData) {
  return createMenuImportFromPdf(formData);
}

export async function getMenuImportJobAction(jobId: string) {
  return getMenuImportJob(jobId);
}

export async function updateMenuImportItemsAction(jobId: string, items: MenuImportEditableItem[]) {
  return updateMenuImportItems(jobId, items);
}

export async function approveMenuImportAction(jobId: string, items: MenuImportEditableItem[]) {
  return approveMenuImport(jobId, items);
}

export async function cancelMenuImportAction(jobId: string) {
  return cancelMenuImport(jobId);
}
