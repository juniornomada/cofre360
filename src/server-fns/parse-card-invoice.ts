import { createServerFn } from "@tanstack/react-start";

// Parse a credit-card invoice OR bank-account statement PDF using unpdf
// (text extraction, edge-runtime friendly) and Lovable AI Gateway.

type ParsedInvoiceTx = {
  date: string;
  name: string;
  amount: number;
  original_amount_text?: string;
  type: "expense" | "income";
  confidence_score?: number; // 0-100
};

type DocumentKind = "card_invoice" | "bank_statement";

const ALLOWED_MODELS = [
  "google/gemini-2.0-flash",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-image",
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-pro",
  "anthropic/claude-3-5-sonnet",
  "openai/gpt-4o",
  "openai/gpt-4o-mini"
];

function validateModel(model: string) {
  if (!ALLOWED_MODELS.includes(model)) {
    throw new Error(`Modelo de IA não suportado ou expirado: ${model}. Por favor, use um dos seguintes: ${ALLOWED_MODELS.join(", ")}`);
  }
}
async function fetchAiWithFallback(payload: any, requestedModel: string): Promise<Response> {
  const FALLBACK_MODEL = "google/gemini-2.5-flash";
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;

  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY ausente — não foi possível processar o PDF.");
  }

  const call = async (model: string) => {
    validateModel(model);
    return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...payload, model }),
    });
  };

  let response = await call(requestedModel);

  // Se falhar com erro 400 e a mensagem contiver "model", ou se for 400 e o modelo for diferente do fallback
  if (!response.ok && response.status === 400 && requestedModel !== FALLBACK_MODEL) {
    try {
      const errorBody = await response.clone().text();
      if (errorBody.toLowerCase().includes("model")) {
        console.warn(`Modelo ${requestedModel} indisponível. Tentando fallback: ${FALLBACK_MODEL}`);
        return await call(FALLBACK_MODEL);
      }
    } catch {
      // Fallback silencioso em caso de erro 400 genérico
      return await call(FALLBACK_MODEL);
    }
  }

  return response;
}

async function validateAndExtractPdfText(base64: string): Promise<string> {
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));

  // unpdf works in Node/Bun/Workers without worker setup
  const { extractText, getDocumentProxy } = await import("unpdf");
  
  let pdf;
  try {
    pdf = await getDocumentProxy(bytes);
  } catch (err: any) {
    if (err?.message?.includes("password") || err?.name === "PasswordException") {
      throw new Error("Este PDF está protegido por senha. Remova a proteção antes de enviar.");
    }
    throw new Error("Não foi possível abrir o PDF. O arquivo pode estar corrompido ou ser inválido.");
  }

  if (pdf.numPages > 50) {
    throw new Error(`Este PDF tem muitas páginas (${pdf.numPages}). O limite é de 50 páginas.`);
  }

  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : text;
}




async function aiExtractTransactions(rawText: string, kind: DocumentKind, isRetry: boolean = false): Promise<ParsedInvoiceTx[]> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY ausente — não foi possível processar o PDF.");
  }

  // Truncate to keep token usage reasonable
  const trimmed = rawText.length > 60000 ? rawText.slice(0, 60000) : rawText;

  const cardPrompt = `Você recebe o texto bruto extraído de uma fatura de cartão de crédito brasileira. Extraia TODAS as transações (compras, parcelas, estornos, taxas) presentes na fatura.

Regras:
- "date" no formato YYYY-MM-DD. Se faltar o ano no PDF, infira pelo período da fatura ou use o ano atual.
- "name" é a descrição do estabelecimento/lançamento (limpo, sem códigos longos).
- "amount" é número positivo em reais (sem R$, sem ponto de milhar; use ponto decimal).
- "original_amount_text" é a string exata do valor como aparece no texto (ex: "1.234,56" ou "R$ 50,00").
- "type": "expense" para compras/débitos. "income" para estornos, créditos, pagamentos recebidos.
- "confidence_score": número de 0 a 100 indicando sua certeza sobre os dados extraídos desta linha.
- Inclua parcelas individuais (se a linha indica "02/12" use isso no nome: "Loja X (2/12)").
- Ignore: total da fatura, juros consolidados, saldo anterior, limites, pagamentos do cliente à fatura.
- Se não houver transações claras, retorne lista vazia.`;

  const bankPrompt = `Você recebe o texto bruto extraído de um EXTRATO BANCÁRIO brasileiro (conta corrente / poupança / digital). Extraia TODAS as movimentações (débitos e créditos) presentes no extrato.

Regras:
- "date" no formato YYYY-MM-DD. Se faltar o ano no PDF, infira pelo período do extrato ou use o ano atual.
- "name" é a descrição da movimentação limpa (ex.: "PIX recebido - João", "Compra débito - Padaria X", "Tarifa mensal", "Salário").
- "amount" é número positivo em reais (sem R$, sem ponto de milhar; use ponto decimal — sempre positivo).
- "original_amount_text" é a string exata do valor como aparece no texto original.
- "type": "expense" para débitos/saídas/pagamentos/PIX enviado/compras. "income" para créditos/entradas/PIX recebido/depósitos/salário/rendimentos.
- "confidence_score": número de 0 a 100 indicando sua certeza sobre os dados desta linha.
- Ignore: saldo do dia, saldo anterior, saldo final, totais, cabeçalhos, limite de cheque especial.
- Não duplique a mesma linha. Se houver "Detalhe" abaixo de uma linha, junte na descrição.
- Se não houver movimentações claras, retorne lista vazia.`;

  const retryPrompt = isRetry ? "\nATENÇÃO: A tentativa anterior falhou em encontrar dados. Por favor, analise o texto com cuidado extra, ignorando ruídos de formatação ou caracteres estranhos resultantes da extração do PDF." : "";
  const prompt = `${kind === "bank_statement" ? bankPrompt : cardPrompt}${retryPrompt}


Texto do PDF:
"""
${trimmed}
"""`;

  const systemMsg = kind === "bank_statement"
    ? "Você é um parser preciso de extratos bancários brasileiros. Sempre retorne JSON válido."
    : "Você é um parser preciso de faturas de cartão de crédito brasileiras. Sempre retorne JSON válido.";

  const model = "google/gemini-2.5-flash";
  validateModel(model);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,

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
                      original_amount_text: { type: "string" },
                      type: { type: "string", enum: ["expense", "income"] },
                      confidence_score: { type: "number", minimum: 0, maximum: 100 },
                    },
                    required: ["date", "name", "amount", "original_amount_text", "type", "confidence_score"],
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

export type ParsePdfResult = {
  transactions: ParsedInvoiceTx[];
  charsExtracted: number;
  attempts: number;
  rawPdfText: string;
};

export const aiRetrySingleTransaction = createServerFn({ method: "POST" })
  .inputValidator((input: { rawText: string; transaction: ParsedInvoiceTx; kind: DocumentKind }) => {
    if (!input || !input.rawText || !input.transaction) {
      throw new Error("Dados ausentes para reprocessamento.");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente.");

    // Narrow down the context to help AI find the specific transaction
    const prompt = `Você recebeu o texto de um documento financeiro e uma transação que foi extraída com baixa confiança.
Sua tarefa é analisar o texto novamente e tentar extrair os dados CORRETOS para esta transação específica.

Transação com dúvida:
- Data original: ${data.transaction.date}
- Nome original: ${data.transaction.name}
- Valor original: ${data.transaction.amount} (Texto lido: ${data.transaction.original_amount_text})

Texto do PDF:
"""
${data.rawText.slice(0, 15000)}
"""

Retorne apenas os dados corrigidos no formato JSON.`;

    const model = "google/gemini-2.5-flash";
    validateModel(model);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,

        messages: [
          { role: "system", content: "Você é um especialista em extração de dados financeiros. Retorne JSON válido via function call." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_corrected_transaction",
              parameters: {
                type: "object",
                properties: {
                  date: { type: "string" },
                  name: { type: "string" },
                  amount: { type: "number" },
                  type: { type: "string", enum: ["expense", "income"] },
                },
                required: ["date", "name", "amount", "type"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_corrected_transaction" } },
      }),
    });

    if (!response.ok) throw new Error("Erro na chamada da IA.");
    const result = await response.json();
    const args = JSON.parse(result?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}");
    
    return {
      ...args,
      confidence_score: 100,
      original_amount_text: data.transaction.original_amount_text // Keep for reference
    } as ParsedInvoiceTx;
  });

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
  .handler(async ({ data }): Promise<ParsePdfResult> => {
    const text = await validateAndExtractPdfText(data.fileBase64);

    if (!text || text.trim().length < 30) {
      throw new Error("Não foi possível extrair texto deste PDF. Se for uma imagem ou escaneado, tente usar um PDF original gerado pelo banco.");
    }

    let lastError = null;
    const MAX_RETRIES = 2;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const transactions = await aiExtractTransactions(text, data.kind, attempt > 0);
        
        if (transactions.length === 0) {
          throw new Error("A IA não encontrou transações claras neste arquivo. Verifique se o layout do PDF é suportado.");
        }
        
        return { transactions, charsExtracted: text.length, attempts: attempt + 1, rawPdfText: text };
      } catch (err: any) {
        lastError = err;
        console.warn(`Tentativa ${attempt + 1} de extração falhou:`, err.message);
        
        // Don't retry if it's a credit/auth error
        if (err.message?.includes("LOVABLE_API_KEY") || err.message?.includes("Créditos")) {
          throw err;
        }
        
        // Wait a bit before retrying (exponential backoff)
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error("Falha na extração por IA após várias tentativas.");
  });

