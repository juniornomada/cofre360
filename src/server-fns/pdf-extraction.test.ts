import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';

// Mock simple environment for PDF.js server-side
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjsWorker: any = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");

  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  }

  const loadingTask = pdfjs.getDocument({
    data: bytes,
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
    // 1. Create a simple PDF using jsPDF
    const doc = new jsPDF();
    doc.text("Hello Lovable PDF Test", 10, 10);
    const pdfArrayBuffer = doc.output('arraybuffer');
    const bytes = new Uint8Array(pdfArrayBuffer);

    // 2. Extract text using the logic from our server function
    const extractedText = await extractPdfText(bytes);

    // 3. Verify
    expect(extractedText).toContain("Hello Lovable PDF Test");
  });

  it('should handle GlobalWorkerOptions correctly', async () => {
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBeDefined();
  });
});
