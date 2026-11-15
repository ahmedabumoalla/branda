import { localStorageUpload } from "./api";
export function createClient() {
  return {
    storage: { from: (bucket: string) => ({ uploadToSignedUrl: (path: string, token: string, file: File | Blob) => localStorageUpload(bucket, path, token, file) }) },
    auth: { onAuthStateChange: (callback: (event: string) => void) => { const listener = () => callback("SIGNED_OUT"); window.addEventListener("branda:logout", listener); return { data: { subscription: { unsubscribe: () => window.removeEventListener("branda:logout", listener) } } }; } },
  };
}
