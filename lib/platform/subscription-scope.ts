export interface SubscriptionScopeSegment {
  text: string;
  bold: boolean;
}

export interface SubscriptionScopeParagraph {
  number: string | null;
  segments: SubscriptionScopeSegment[];
}

/** A deliberately small, text-only subset: paragraphs, ordered markers and bold. */
export function parseSubscriptionScope(text: string): SubscriptionScopeParagraph[] {
  return text.replace(/\r\n?/g, "\n").split("\n").filter(line => line.trim()).map(line => {
    const ordered = line.match(/^\s*([0-9٠-٩۰-۹]+)\.\s+(.*)$/u);
    const content = ordered ? ordered[2] : line.trim();
    const segments: SubscriptionScopeSegment[] = [];
    const emphasis = /\*\*([^*]+)\*\*/gu;
    let position = 0;
    for (const match of content.matchAll(emphasis)) {
      const start = match.index!;
      if (start > position) segments.push({ text: content.slice(position, start), bold: false });
      segments.push({ text: match[1], bold: true });
      position = start + match[0].length;
    }
    if (position < content.length) segments.push({ text: content.slice(position), bold: false });
    return { number: ordered?.[1] ?? null, segments };
  });
}
