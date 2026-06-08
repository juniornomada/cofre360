import { describe, it, expect, vi } from 'vitest';

// We need to mock the environment to test the server-side logic
// Since parse-card-invoice.ts is a server function using @tanstack/react-start,
// we'll focus on testing the core extraction logic.

describe('PDF Extraction Worker Fallback', () => {
  it('should successfully extract text using PDFWorker with null port (FakeWorker fallback)', async () => {
    // We import the logic. In a real vitest environment, we might need to mock some browser globals
    // if the library expects them, but pdfjs-dist/legacy/build/pdf.mjs is designed for Node.js too.
    
    // Minimal PDF base64 generated in previous step
    const base64 = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA2MTIgNzkyXS9Db250ZW50cyA0IDAgUiA+PgplbmRvYmoKMyAwIG9iago8PC9LaWRzWzIgMCBSXS9Db3VudCAxPj4KZW5kb2JqCjQgMCBvYmoKPDwvTGVuZ3RoIDUyPj5zdHJlYW0KQlQgL0YxIDEyIFRmIDcwIDcwMCBUZCAoVGVzdCBQREYgQ29udGVudCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTAgMDAwMDAgbiAKMDAwMDAwMDA1OSAwMDAwMCBuIAowMDAwMDAwMTQzIDAwMDAwIG4gCjAwMDAwMDAxODkgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA1IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgozMDcKJSVFT0Y=';
    
    // We mock GlobalWorkerOptions to simulate an invalid state if needed,
    // but the implementation in parse-card-invoice.ts uses a fresh PDFWorker instance
    // which should bypass global state anyway.
    
    try {
      // Dynamic import as the code does
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      
      // Verification: Check if we can instantiate PDFWorker and get a document
      // without setting workerSrc.
      const worker = new pdfjs.PDFWorker({
        name: "Test-Worker",
        port: null,
        verbosity: 0
      });

      const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
      const loadingTask = pdfjs.getDocument({
        data: bytes,
        worker: worker,
        disableWorker: true,
        verbosity: 0
      });

      const doc = await loadingTask.promise;
      expect(doc.numPages).toBeGreaterThan(0);
      
      const page = await doc.getPage(1);
      const textContent = await page.getTextContent();
      const text = textContent.items.map((it: any) => it.str).join(' ');
      
      expect(text).toContain('Test PDF Content');
      
    } catch (error) {
      console.error('Extraction failed:', error);
      throw error;
    }
  });

  it('should handle global workerSrc being invalid without crashing', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    
    // Simulate someone setting an invalid module path that would cause "No such module"
    pdfjs.GlobalWorkerOptions.workerSrc = '_libs/pdf.worker.mjs';
    
    // The code in src/server-fns/parse-card-invoice.ts should still work
    // because it passes an explicit worker instance with port: null
    
    const worker = new pdfjs.PDFWorker({
      name: "Fallback-Test-Worker",
      port: null,
      verbosity: 0
    });

    expect(worker).toBeDefined();
    // In pdf.js, if port is null, it should trigger FakeWorker
    // We can't easily check private internal state, but we can check if it works.
    
    const base64 = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA2MTIgNzkyXS9Db250ZW50cyA0IDAgUiA+PgplbmRvYmoKMyAwIG9iago8PC9LaWRzWzIgMCBSXS9Db3VudCAxPj4KZW5kb2JqCjQgMCBvYmoKPDwvTGVuZ3RoIDUyPj5zdHJlYW0KQlQgL0YxIDEyIFRmIDcwIDcwMCBUZCAoVGVzdCBQREYgQ29udGVudCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTAgMDAwMDAgbiAKMDAwMDAwMDA1OSAwMDAwMCBuIAowMDAwMDAwMTQzIDAwMDAwIG4gCjAwMDAwMDAxODkgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA1IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgozMDcKJSVFT0Y=';
    const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
    
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      worker: worker,
      disableWorker: true,
      verbosity: 0
    });

    const doc = await loadingTask.promise;
    expect(doc.numPages).toBe(1);
  });
});
