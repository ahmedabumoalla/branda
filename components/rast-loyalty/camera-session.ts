type ScannerControls = { stop: () => void };
type ScannerResult = { getText: () => string };
type CameraReader = {
  decodeFromStream: (stream: MediaStream, video: HTMLVideoElement, callback: (result: ScannerResult | undefined | null, error: unknown, controls: ScannerControls) => void) => Promise<ScannerControls>;
};

type Options = {
  video: HTMLVideoElement;
  onDetected: (value: string) => void;
  onError: () => void;
  acquireStream?: () => Promise<MediaStream>;
  loadReader?: () => Promise<CameraReader>;
};

export function startRastCameraSession({ video, onDetected, onError, acquireStream, loadReader }: Options) {
  let cancelled = false;
  let controls: ScannerControls | undefined;
  let stream: MediaStream | undefined;
  function stop() {
    cancelled = true;
    controls?.stop();
    stream?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
  async function start() {
    try {
      const reader = await (loadReader ? loadReader() : import("@zxing/browser").then(({ BrowserQRCodeReader }) => new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 180 })));
      if (cancelled) return;
      stream = await (acquireStream ? acquireStream() : navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false }));
      if (cancelled) { stop(); return; }
      controls = await reader.decodeFromStream(stream, video, (result, _error, scanner) => {
        if (!result || cancelled) return;
        controls = scanner;
        stop();
        onDetected(result.getText());
      });
      if (cancelled) stop();
    } catch {
      const notify = !cancelled;
      stop();
      if (notify) onError();
    }
  }
  void start();
  return stop;
}
