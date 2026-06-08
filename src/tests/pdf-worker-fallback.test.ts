import { describe, it, expect } from 'vitest';

// @ts-ignore
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

describe('PDF Extraction Worker Fallback', () => {
  it('should successfully extract text using PDFWorker with null port (FakeWorker fallback)', async () => {
    const base64 = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA2MTIgNzkyXS9Db250ZW50cyA0IDAgUiA+PgplbmRvYmoKMyAwIG9iago8PC9LaWRzWzIgMCBSXS9Db3VudCAxPj4KZW5kb2JqCjQgMCBvYmoKPDwvTGVuZ3RoIDUyPj5zdHJlYW0KQlQgL0YxIDEyIFRmIDcwIDcwMCBUZCAoVGVzdCBQREYgQ29udGVudCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTAgMDAwMDAgbiAKMDAwMDAwMDA1OSAwMDAwMCBuIAowMDAwMDAwMTQzIDAwMDAwIG4gCjAwMDAwMDAxODkgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA1IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgozMDcKJSVFT0Y=';
    
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
    expect(doc.numPages).toBeGreaterThan(0);
    
    const page = await doc.getPage(1);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((it: any) => it.str).join(' ');
    
    expect(text).toContain('Test PDF Content');
  });

  it('should handle global workerSrc being invalid without crashing', async () => {
    (pdfjs as any).GlobalWorkerOptions.workerSrc = '_libs/pdf.worker.mjs';
    
    const worker = new (pdfjs as any).PDFWorker({
      name: "Fallback-Test-Worker",
      port: null,
      verbosity: 0
    });

    expect(worker).toBeDefined();
    
    const base64 = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA2MTIgNzkyXS9Db3VudGVudHMgNCAwIFIgPj4KZW5kb2JqCjMgMCBvYmoKPDwvS2lkc1syIDAgUl0vQ291bnQgMT4+CnBlbmRvYmoKNCAwIG9iago8PC9MZW5ndGggNTI+PnN0cmVhbQpCVCAvRjEgMTIgVGYgNzAgNzAwIFRkIChUZXN0IFBERiBDb250ZW50KSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxMCAwMDAwMCBuIAowMDAwMDAwMDU5IDAwMDAwIG4gCjAwMDAwMDAxNDMgMDAwMDAgbiAKMDAwMDAwMDE4OSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDUgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjMwNwolJUVPRg==';
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
