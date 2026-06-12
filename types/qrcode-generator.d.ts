declare module "qrcode-generator" {
  type QrErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  type QrCode = {
    addData(data: string): void;
    make(): void;
    createSvgTag(cellSize?: number, margin?: number): string;
  };

  export default function QRCode(typeNumber?: number, errorCorrectionLevel?: QrErrorCorrectionLevel): QrCode;
}
