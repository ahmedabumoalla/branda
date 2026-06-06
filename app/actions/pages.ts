"use server";

import { deletePage, getOwnerPages, upsertPage } from "@/lib/data/pages";
import type { CafeInfoPage } from "@/lib/mock/cafe-pages";

export async function fetchOwnerPagesAction() {
  return getOwnerPages();
}

export async function savePageAction(page: CafeInfoPage) {
  return upsertPage({
    id: /^[0-9a-f-]{36}$/i.test(page.id) ? page.id : undefined,
    title: page.title,
    slug: page.slug,
    description: page.description,
    content: page.content,
    visible: page.visible,
  });
}

export async function deletePageAction(pageId: string) {
  await deletePage(pageId);
}
