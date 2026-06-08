import { describe, it, expect } from 'vitest';

// @ts-ignore
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

describe('PDF Extraction Worker Fallback', () => {
  it('should successfully load document using PDFWorker with null port (FakeWorker fallback)', async () => {
    // A valid minimal PDF structure
    const base64 = 'JVBERi0xLjcKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAyIDAgUiA+PgplbmRvYmoKMiAwIG9iagogIDw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbMyAwIFJdIC9Db3VudCAxID4+CmVuZG9iagozIDAgb2JqCiAgPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8ID4+ID4+CmVuZG9iagp0cmFpbGVyCiAgPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTA0CiUlRU9G';
    
    const worker = new (pdfjs as any).PDFWorker({
      name: "Test-Worker",
      port: null,
      verbosity: 0
    });

    const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
    const loadingTask = (pdfjs as any).getDocument({
      data: bytes,
      worker: worker,
      verbosity: 0
    });

    const doc = await loadingTask.promise;
    expect(doc.numPages).toBe(1);
  });

  it('should handle global workerSrc being invalid without crashing', async () => {
    const p1 = "pdfjs-dist";
    const p2 = "legacy/build/pdf.worker.mjs";
    (pdfjs as any).GlobalWorkerOptions.workerSrc = `${p1}/${p2}`;

    
    const worker = new (pdfjs as any).PDFWorker({
      name: "Fallback-Test-Worker",
      port: null,
      verbosity: 0
    });

    expect(worker).toBeDefined();
    
    const base64 = 'JVBERi0xLjcKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAyIDAgUiA+PgplbmRvYmoKMiAwIG9iagogIDw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbMyAwIFJdIC9Db3VudCAxID4+CmVuZG9iagozIDAgb2JqCiAgPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8ID4+ID4+CmVuZG9iagp0cmFpbGVyCiAgPDwgL1NpemUgNCAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMTA0CiUlRU9G';
    const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
    
    const loadingTask = (pdfjs as any).getDocument({
      data: bytes,
      worker: worker,
      verbosity: 0
    });

    const doc = await loadingTask.promise;
    expect(doc.numPages).toBe(1);
  });
});
