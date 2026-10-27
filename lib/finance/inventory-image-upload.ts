export type InventoryUploadProgress = { percent: number | null; processing: boolean };

export function uploadInventoryImage(url: string, file: File, signal: AbortSignal, onProgress: (progress: InventoryUploadProgress) => void): Promise<{ path: string; url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    function finish(error?: Error, result?: { path: string; url: string }) {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      xhr.upload.onprogress = null; xhr.upload.onload = null;
      xhr.onload = null; xhr.onerror = null; xhr.onabort = null; xhr.ontimeout = null;
      if (error) reject(error); else resolve(result!);
    }
    function abort() { xhr.abort(); finish(new Error("Upload aborted")); }
    if (signal.aborted) { finish(new Error("Upload aborted")); return; }
    xhr.open("POST", url);
    xhr.timeout = 120_000;
    xhr.upload.onprogress = event => onProgress({ percent: event.lengthComputable && event.total > 0 ? Math.min(100, Math.round(event.loaded / event.total * 100)) : null, processing: false });
    xhr.upload.onload = () => onProgress({ percent: 100, processing: true });
    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300 || typeof result.path !== "string" || typeof result.url !== "string") throw new Error("Upload failed");
        finish(undefined, result);
      } catch { finish(new Error("Upload failed")); }
    };
    xhr.onerror = xhr.ontimeout = () => finish(new Error("Upload failed"));
    xhr.onabort = () => finish(new Error("Upload aborted"));
    signal.addEventListener("abort", abort, { once: true });
    const body = new FormData(); body.append("file", file);
    try { xhr.send(body); } catch { finish(new Error("Upload failed")); }
  });
}
