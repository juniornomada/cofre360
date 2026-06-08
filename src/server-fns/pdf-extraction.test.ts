import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';

// Mock simple environment for PDF.js server-side
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  
  const worker = new pdfjs.PDFWorker({
    name: "PDFWorker-Test",
    port: null,
    verbosity: 0,
  });

  const loadingTask = pdfjs.getDocument({
    data: bytes,
    worker: worker,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });

  const doc = await loadingTask.promise;
  let full = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    full += content.items.map((it: any) => it.str).join(" ");
  }
  return full;
}

describe('PDF Text Extraction (Server Environment Mock)', () => {
  it('should extract text from a generated PDF without worker errors', async () => {
    const doc = new jsPDF();
    doc.text("Hello Lovable PDF Test", 10, 10);
    const pdfArrayBuffer = doc.output('arraybuffer');
    const bytes = new Uint8Array(pdfArrayBuffer);

    const extractedText = await extractPdfText(bytes);
    expect(extractedText).toContain("Hello Lovable PDF Test");
  });
});
