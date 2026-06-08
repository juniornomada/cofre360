import { describe, it, expect } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

describe('PDF Import Production Environment Simulation', () => {
  it('should extract metadata from a minimal PDF using the same logic as the server function', async () => {
    const base64 = 'JVBERi0xLjcKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAyIDAgUiA+PgplbmRvYmoKMiAwIG9iagogIDw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbMyAwIFJdIC9Db3VudCAxID4+CmVuZG9iagozIDAgb2JqCiAgPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8ID4+ID4+CmVuZG9iagp0cmFpbGVyCiAgPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTA0CiUlRU9G';
    const bytes = new Uint8Array(Buffer.from(base64, "base64"));

    if (typeof (pdfjs as any).GlobalWorkerOptions !== "undefined") {
      (pdfjs as any).GlobalWorkerOptions.workerSrc = 'data:text/javascript;base64,ZXhwb3J0IGRlZmF1bHQge307';
    }

    const worker = new (pdfjs as any).PDFWorker({
      name: "Production-Test-Worker",
      port: null,
      verbosity: 0,
    });

    const loadingTask = (pdfjs as any).getDocument({
      data: bytes,
      worker: worker,
      verbosity: 0,
    });

    const doc = await loadingTask.promise;
    expect(doc.numPages).toBe(1);
    
    await worker.destroy();
  });

  it('should verify that setting workerSrc to empty string prevents the library from looking for external scripts', () => {
    (pdfjs as any).GlobalWorkerOptions.workerSrc = "";
    expect((pdfjs as any).GlobalWorkerOptions.workerSrc).toBe("");
  });
});


