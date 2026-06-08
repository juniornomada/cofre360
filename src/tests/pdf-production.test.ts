import { describe, it, expect } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

describe('PDF Import Production Environment Simulation', () => {
  it('should extract metadata from a minimal PDF without worker errors using manual worker initialization', async () => {
    // Valid minimal PDF base64
    const base64 = 'JVBERi0xLjcKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAyIDAgUiA+PgplbmRvYmoKMiAwIG9iagogIDw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbMyAwIFJdIC9Db3VudCAxID4+CmVuZG9iagozIDAgb2JqCiAgPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8ID4+ID4+CmVuZG9iagp0cmFpbGVyCiAgPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTA0CiUlRU9G';
    
    const bytes = new Uint8Array(Buffer.from(base64, "base64"));

    // Reset global worker options to ensure we aren't relying on them
    (pdfjs as any).GlobalWorkerOptions.workerSrc = '';

    // The key for production: DO NOT let pdf.js try to find the worker.
    // We create a PDFWorker and explicitly pass it to getDocument.
    const worker = new (pdfjs as any).PDFWorker({
      name: "Production-Test-Worker",
      port: null, // Critical: Forces fake worker
      verbosity: 0,
    });

    const loadingTask = (pdfjs as any).getDocument({
      data: bytes,
      worker: worker,
      verbosity: 0,
    });

    // Wait for the document to load. If it doesn't throw "No workerSrc specified", 
    // it means the manual worker association worked.
    const doc = await loadingTask.promise;
    expect(doc.numPages).toBe(1);
    
    // Cleanup
    await worker.destroy();
  });

  it('should have worker port as null when initialized for fake worker', async () => {
    const worker = new (pdfjs as any).PDFWorker({
      port: null,
    });
    
    // Verify internal state confirms it's not using a MessagePort/Worker
    expect((worker as any)._port).toBeNull();
  });
});

