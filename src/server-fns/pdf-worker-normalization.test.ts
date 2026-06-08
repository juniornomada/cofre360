import { describe, it, expect } from 'vitest';

async function normalizeWorkerOptions() {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  
  if (pdfjs.GlobalWorkerOptions) {
    const options = pdfjs.GlobalWorkerOptions;
    if (typeof options.workerSrc !== "string") {
      delete (options as any).workerSrc;
    }
    if (options.workerPort !== undefined && (typeof options.workerPort !== "object" || options.workerPort === null)) {
      delete (options as any).workerPort;
    }
  }
  return pdfjs.GlobalWorkerOptions;
}

describe('PDF Worker Options Normalization', () => {
  it('should remove invalid workerSrc types (null)', async () => {
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = null;
    
    const options = await normalizeWorkerOptions();
    expect(typeof options.workerSrc).not.toBe('object');
    expect(options.workerSrc).toBeUndefined();
  });

  it('should remove invalid workerPort types (string)', async () => {
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerPort = "invalid_port";
    
    const options = await normalizeWorkerOptions();
    expect(options.workerPort).toBeUndefined();
  });

  it('should keep valid workerSrc (string)', async () => {
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "some-worker.js";
    
    const options = await normalizeWorkerOptions();
    expect(options.workerSrc).toBe("some-worker.js");
  });
});
