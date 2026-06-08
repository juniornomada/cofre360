import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

console.log('PDF.js GlobalWorkerOptions:', Object.keys(pdfjs.GlobalWorkerOptions));
console.log('PDF.js Worker Module Keys:', Object.keys(pdfjsWorker));
