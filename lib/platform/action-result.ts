export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

// Expected validation failures must be returned, not thrown across the RSC boundary.
export async function actionResult<T>(operation: () => Promise<T>, fallback: string): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return { ok: false, message: "راجع بيانات الباقة: الاسم والأسعار والمدة، ثم احفظ مجددًا." };
    }
    // Only application-authored Arabic Error messages are user-facing.
    // Raw database objects, stack traces and framework errors stay on the server.
    const message = error instanceof Error && /[\u0600-\u06ff]/.test(error.message) && error.message.length < 400
      ? error.message : fallback;
    return { ok: false, message };
  }
}
