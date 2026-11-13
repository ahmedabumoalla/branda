import "server-only";
import sharp from "sharp";
import type { InvoiceCustomField } from "./invoice-custom-fields";

type Category = InvoiceCustomField['fileTypes'][number];
export async function inspectCustomFieldFile(bytes: Buffer, name: string): Promise<{ mime: string; categories: Category[]; image: boolean }> {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'tif', 'tiff', 'webp', 'avif'].includes(ext)) {
    const metadata = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' }).metadata();
    const formats: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', tiff: 'image/tiff', webp: 'image/webp', avif: 'image/avif', heif: 'image/avif' };
    if (!metadata.format || !formats[metadata.format] || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 100) throw new Error('تعذر قراءة الصورة');
    // Decode pixels as well as the header before accepting a verified image
    await sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' }).resize(1, 1).raw().toBuffer();
    return { mime: formats[metadata.format], categories: ['image'], image: true };
  }
  const magic = (hex: string) => bytes.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
  if (ext === 'pdf' && bytes.subarray(0, 5).toString() === '%PDF-') return { mime: 'application/pdf', categories: ['document', 'pdf'], image: false };
  if (['doc', 'xls', 'ppt'].includes(ext) && magic('d0cf11e0a1b11e1')) return { mime: 'application/x-ole-storage', categories: ext === 'xls' ? ['document', 'spreadsheet'] : ['document'], image: false };
  if (['docx', 'xlsx', 'pptx', 'zip'].includes(ext) && (magic('504b0304') || magic('504b0506'))) return { mime: 'application/zip', categories: ext === 'zip' ? ['archive'] : ext === 'xlsx' ? ['document', 'spreadsheet'] : ['document'], image: false };
  if ((ext === 'gz' && magic('1f8b')) || (ext === 'rar' && magic('526172211a07')) || (ext === 'tar' && bytes.subarray(257, 262).toString() === 'ustar')) return { mime: ext === 'gz' ? 'application/gzip' : ext === 'rar' ? 'application/vnd.rar' : 'application/x-tar', categories: ['archive'], image: false };
  if (['txt', 'csv', 'html', 'htm', 'rtf'].includes(ext)) {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('يجب أن يكون المستند النصي بترميز صالح'); }
    if (text.includes('\0')) throw new Error('محتوى الملف لا يطابق نوعه');
    if (ext === 'rtf' && !text.startsWith('{\\rtf')) throw new Error('محتوى الملف لا يطابق نوعه');
    return { mime: ext === 'csv' ? 'text/csv' : ['html', 'htm'].includes(ext) ? 'text/html' : ext === 'rtf' ? 'application/rtf' : 'text/plain', categories: ext === 'txt' ? ['text', 'spreadsheet'] : ext === 'csv' ? ['spreadsheet'] : ext === 'rtf' ? ['document'] : ['html'], image: false };
  }
  throw new Error('نوع الملف غير مدعوم أو أن محتواه لا يطابق امتداده');
}

export async function resizeCustomFieldImage(bytes: Buffer, dimensions: InvoiceCustomField['image']['large']): Promise<Buffer> {
  let pipeline = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' }).rotate();
  if (dimensions.width || dimensions.height) pipeline = pipeline.resize({ width: dimensions.width || undefined, height: dimensions.height || undefined, fit: dimensions.crop ? 'cover' : 'inside', withoutEnlargement: true });
  return pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
}
