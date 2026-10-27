type Controls = { stop: () => void };
type Reader = { decodeFromStream: (stream: MediaStream, video: HTMLVideoElement, callback: (result: { getText: () => string } | null | undefined, error: unknown, controls: Controls) => void) => Promise<Controls> };

/** Own every acquired track, including streams that arrive after the editor closes. */
export function startInventoryCameraSession({ video, onDetected, onError, acquireStream, loadReader }: {
  video: HTMLVideoElement; onDetected: (value: string) => void; onError: () => void;
  acquireStream?: () => Promise<MediaStream>; loadReader?: () => Promise<Reader>;
}) {
  let stopped = false;
  let controls: Controls | undefined;
  let stream: MediaStream | undefined;
  function stop() {
    stopped = true;
    controls?.stop();
    stream?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  void (async () => {
    try {
      const reader = await (loadReader ? loadReader() : import("@zxing/browser").then(({ BrowserMultiFormatReader }) => new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 180 })));
      if (stopped) return;
      stream = await (acquireStream ? acquireStream() : navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false }));
      if (stopped) { stop(); return; }
      controls = await reader.decodeFromStream(stream, video, (result, _error, scanner) => {
        if (!result || stopped) return;
        const value = result.getText().trim();
        if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,63}$/.test(value)) return;
        controls = scanner;
        stop();
        onDetected(value);
      });
      if (stopped) stop();
    } catch {
      const notify = !stopped;
      stop();
      if (notify) onError();
    }
  })();
  return stop;
}
