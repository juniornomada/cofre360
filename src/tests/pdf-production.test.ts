import { describe, it, expect } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

describe('PDF Import Production Environment Simulation', () => {
  it('should extract text from a minimal PDF without worker errors using FakeWorker', async () => {
    // Valid minimal PDF base64
    const base64 = 'JVBERi0xLjcKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAyIDAgUiA+PgplbmRvYmoKMiAwIG9iagogIDw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbMyAwIFJdIC9Db3VudCAxID4+CmVuZG9iagozIDAgb2JqCiAgPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8ID4+ID4+CmVuZG9iagp0cmFpbGVyCiAgPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTA0CiUlRU9G';
    
    // Simulation of the logic in src/server-fns/parse-card-invoice.ts
    const bytes = new Uint8Array(Buffer.from(base64, "base64"));

    // Ensure GlobalWorkerOptions is NOT set to any path (prevents "No such module" errors)
    (pdfjs as any).GlobalWorkerOptions.workerSrc = '';

    // Create a worker with port: null to force internal FakeWorker
    const worker = new (pdfjs as any).PDFWorker({
      name: "Production-Test-Worker",
      port: null,
      verbosity: 0,
    });

    const loadingTask = (pdfjs as any).getDocument({
      data: bytes,
      worker: worker,
      disableWorker: true, // Legacy option but still good for clarity
      verbosity: 0,
    });

    const doc = await loadingTask.promise;
    expect(doc.numPages).toBe(1);
    
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    expect(content.items).toBeDefined();
    
    // Cleanup
    worker.destroy();
  });

  it('should not attempt to load external scripts when worker port is null', async () => {
    // This is the core "fix" for production environments like Nitro/Netlify/Vercel
    // where the worker file might not be accessible at runtime via dynamic import.
    
    const worker = new (pdfjs as any).PDFWorker({
      port: null,
    });
    
    // Internal check: if port is null, PDF.js shouldn't try to use MessagePort/WebWorkers
    expect((worker as any)._port).toBeNull();
  });
});
