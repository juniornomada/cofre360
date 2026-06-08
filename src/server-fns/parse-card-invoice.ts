import { createServerFn } from "@tanstack/react-start";

// Parse a credit-card invoice OR bank-account statement PDF using pdfjs-dist
// (text extraction) and Lovable AI Gateway (structured transaction extraction).
//
// Returns an array of { date: "YYYY-MM-DD", name: string, amount: number, type: "expense"|"income" }.

type ParsedInvoiceTx = {
  date: string;
  name: string;
  amount: number;
  type: "expense" | "income";
};

type DocumentKind = "card_invoice" | "bank_statement";

async function extractPdfText(base64: string): Promise<string> {
  // Decode base64 → Uint8Array reliably across environments (preferring Buffer on server for speed)
  let bytes: Uint8Array;
  if (typeof Buffer !== "undefined") {
    bytes = new Uint8Array(Buffer.from(base64, "base64"));
  } else {
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  }

  // Dynamic import for PDF.js (LEGACY build for better compatibility in server environments)
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  
  // To avoid "No such module" errors in Nitro/Vite environments, we attempt to 
  // initialize the worker using workerPort. This prevents the library from 
  // trying to dynamically resolve or load a worker script via workerSrc.
  if (typeof (pdfjs as any).GlobalWorkerOptions !== "undefined") {
    try {
      const pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      (pdfjs as any).GlobalWorkerOptions.workerPort = pdfjsWorker;
    } catch (e) {
      // If direct import fails, we MUST set a dummy workerSrc to satisfy 
      // the library's internal check, even if we use port: null.
      (pdfjs as any).GlobalWorkerOptions.workerSrc = "pdf.worker.js";
    }
  }

  const worker = new pdfjs.PDFWorker({
    name: "PDFWorker-Server",
    port: null, 
    verbosity: 0,
  });

  const loadingTask = pdfjs.getDocument({
    data: bytes,
    worker: worker,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
    stopAtErrors: false, // Continue parsing even if some objects are missing
  });

  const doc = await loadingTask.promise;

  let full = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Reassemble lines from text items by Y coordinate
    const items = (content.items as any[])
      .map((it) => ({
        str: it.str as string,
        x: it.transform[4] as number,
        y: it.transform[5] as number,
      }))
      .filter((it) => it.str && it.str.trim());

    // Group items by Y (rounded) to form lines, then sort by X
    const linesMap = new Map<number, { x: number; str: string }[]>();
    for (const it of items) {
      const key = Math.round(it.y);
      if (!linesMap.has(key)) linesMap.set(key, []);
      linesMap.get(key)!.push({ x: it.x, str: it.str });
    }
    const sortedY = [...linesMap.keys()].sort((a, b) => b - a); // top → bottom
    const pageLines = sortedY.map((y) =>
      linesMap
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    );
    full += pageLines.join("\n") + "\n\n";
  }
  return full;
}

async function aiExtractTransactions(rawText: string, kind: DocumentKind): Promise<ParsedInvoiceTx[]> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY ausente — não foi possível processar o PDF.");
  }

  // Truncate to keep token usage reasonable
  const trimmed = rawText.length > 60000 ? rawText.slice(0, 60000) : rawText;

  const cardPrompt = `Você recebe o texto bruto extraído de uma fatura de cartão de crédito brasileira. Extraia TODAS as transações (compras, parcelas, estornos, taxas) presentes na fatura.

Regras:
- "date" no formato YYYY-MM-DD. Se faltar o ano no PDF, infira pelo período da fatura ou use o ano atual.
- "name" é a descrição do estabelecimento/lançamento (limpo, sem códigos longos). EXTREMAMENTE IMPORTANTE: Se o texto do PDF mostrar datas próximas à descrição, use a data correta da transação, não apenas a data da fatura.
- "amount" é número positivo em reais (sem R$, sem ponto de milhar; use ponto decimal). Se houver um símbolo de menos (-) ou sinal de CRÉDITO ao lado do valor, o tipo será "income".
- "type": "expense" para compras/débitos/tarifas. "income" para estornos, créditos, pagamentos de fatura recebidos, cashback.
- MUITO IMPORTANTE: Procure por transações em TODAS as seções (Lançamentos Nacionais, Lançamentos Internacionais, Créditos, etc). Não pule nenhuma linha que pareça uma transação.
- Se o valor estiver entre parênteses ou tiver um sinal de menos (-), verifique se é um crédito (income).
- "date": Use o formato YYYY-MM-DD. Se o PDF mostrar apenas "DD/MM", use o ano correspondente ao período da fatura. Se for uma transação de meses anteriores aparecendo na fatura (como uma parcela), use a data original se disponível.
- Ignore: cabeçalhos de colunas, resumos de limites, gráficos, propagandas.
- Se o PDF trouxer transações que pareçam duplicadas (mesmo valor, mesma data, nomes similares), inclua-as separadamente se estiverem em linhas distintas, pois podem ser compras recorrentes.
- Extraia TODAS as transações individuais, sem exceção. Se a fatura tiver muitas páginas, processe todas. Certifique-se de capturar o valor TOTAL de cada transação.
- Se não houver transações claras, retorne lista vazia.`;

  const bankPrompt = `Você recebe o texto bruto extraído de um EXTRATO BANCÁRIO brasileiro (conta corrente / poupança / digital). Extraia TODAS as movimentações (débitos e créditos) presentes no extrato.

Regras:
- "date" no formato YYYY-MM-DD. Se faltar o ano no PDF, infira pelo período do extrato ou use o ano atual.
- "name" é a descrição da movimentação limpa (ex.: "PIX recebido - João", "Compra débito - Padaria X", "Tarifa mensal", "Salário").
- "amount" é número positivo em reais (sem R$, sem ponto de milhar; use ponto decimal — sempre positivo).
- "type": "expense" para débitos/saídas/pagamentos/PIX enviado/compras. "income" para créditos/entradas/PIX recebido/depósitos/salário/rendimentos.
- Ignore: saldo do dia, saldo anterior, saldo final, totais, cabeçalhos, limite de cheque especial.
- Não duplique a mesma linha. Se houver "Detalhe" abaixo de uma linha, junte na descrição.
- Se não houver movimentações claras, retorne lista vazia.`;

  const prompt = `${kind === "bank_statement" ? bankPrompt : cardPrompt}

Texto do PDF:
"""
${trimmed}
"""`;

  const systemMsg = kind === "bank_statement"
    ? "Você é um parser preciso de extratos bancários brasileiros. Sempre retorne JSON válido."
    : "Você é um parser preciso de faturas de cartão de crédito brasileiras. Sempre retorne JSON válido.";

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "submit_transactions",
            description: "Envia a lista de transações extraídas do PDF.",
            parameters: {
              type: "object",
              properties: {
                transactions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      date: { type: "string", description: "YYYY-MM-DD" },
                      name: { type: "string" },
                      amount: { type: "number" },
                      type: { type: "string", enum: ["expense", "income"] },
                    },
                    required: ["date", "name", "amount", "type"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["transactions"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "submit_transactions" } },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em alguns instantes.");
    if (response.status === 402) throw new Error("Créditos de IA insuficientes. Adicione créditos em Configurações → Lovable AI.");
    throw new Error(`Falha ao chamar IA (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error("A IA não retornou transações. Tente um PDF mais legível.");
  }

  let parsed: { transactions?: ParsedInvoiceTx[] };
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new Error("Resposta da IA inválida.");
  }

  const txs = (parsed.transactions || []).filter(
    (t) =>
      t &&
      typeof t.name === "string" &&
      typeof t.date === "string" &&
      typeof t.amount === "number" &&
      isFinite(t.amount) &&
      t.amount > 0 &&
      (t.type === "expense" || t.type === "income")
  );

  return txs;
}

export const parseCardInvoicePdf = createServerFn({ method: "POST" })
  .inputValidator((input: { fileBase64: string; fileName: string; kind?: DocumentKind }) => {
    if (!input || typeof input.fileBase64 !== "string" || !input.fileBase64) {
      throw new Error("Arquivo PDF ausente.");
    }
    if (input.fileBase64.length > 20 * 1024 * 1024) {
      throw new Error("Arquivo muito grande (máx. ~10MB).");
    }
    return { ...input, kind: input.kind ?? "card_invoice" as DocumentKind };
  })
  .handler(async ({ data }) => {
    const text = await extractPdfText(data.fileBase64);
    if (!text || text.trim().length < 30) {
      throw new Error("Não foi possível extrair texto deste PDF (talvez seja imagem escaneada).");
    }
    const transactions = await aiExtractTransactions(text, data.kind);
    return { transactions, charsExtracted: text.length };
  });
