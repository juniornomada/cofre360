import { createServerFn } from "@tanstack/react-start";
import * as fs from "fs";

// Mock minimal version of the function logic to test PDF.js loading
async function testPdfLoading() {
  try {
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs";

    console.log("PDF.js and workerSrc set. Attempting to load a dummy PDF...");
    
    // A minimal 1-page blank PDF in base64
    const minPdf = "JVBERi0xLjcKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqMiAwIG9iajw8L1R5cGUvUGFnZXMvQ291bnQgMS9LaWRzWzMgMCBSXT4+ZW5kb2JqMyAwIG9iajw8L1R5cGUvUGFnZS9QYXJlbnQgMiAwIFIvTWVkaWFCb3hbMCAwIDYxMiA3OTJdL1Jlc291cmNlczw8Pj4+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUi9TaXplIDQ+Pgp%%EOF";
    const bytes = new Uint8Array(Buffer.from(minPdf, "base64"));

    const loadingTask = pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
      stopAtErrors: true,
      isEvalSupported: false,
      disableFontFace: true,
    });
    
    const doc = await loadingTask.promise;
    console.log("Success! Loaded PDF with", doc.numPages, "pages.");
    process.exit(0);
  } catch (err) {
    console.error("Failed to load PDF:", err);
    process.exit(1);
  }
}

testPdfLoading();
