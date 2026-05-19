---
name: PDF Import (Card Invoice + Bank Statement)
description: Importação de PDF (fatura de cartão OU extrato bancário) com pdfjs-dist + Lovable AI (Gemini 2.5 Flash) e dedup
type: feature
---
- Server function `parseCardInvoicePdf` em `src/server/parse-card-invoice.ts`: extrai texto com `pdfjs-dist/legacy/build/pdf.mjs` (worker desabilitado, compatível com Cloudflare Workers) e envia para o Lovable AI Gateway (`google/gemini-2.5-flash`) com tool calling. Aceita parâmetro `kind: "card_invoice" | "bank_statement"` (default `card_invoice`) que troca o prompt usado.
- Cartão: `PdfInvoiceImportDialog` em `src/components/PdfInvoiceImportDialog.tsx` — dedup por (card+date+name+amount+type), insere com `card = nome do cartão`. Botão "Importar PDF" em cada cartão na página `/cards`.
- Conta bancária: `PdfStatementImportDialog` em `src/components/PdfStatementImportDialog.tsx` — dedup por (bank_account_id+date+name+amount+type), insere com `bank_account_id`. Botão FileText em cada conta na página `/accounts`, ao lado do botão CSV (Upload).
- Erros 402/429 do gateway são traduzidos para mensagens amigáveis (créditos esgotados / limite de uso).
