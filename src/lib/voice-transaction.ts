export type VoiceTransactionType = "expense" | "income";

export type VoiceTransactionDraft = {
  type: VoiceTransactionType;
  name: string;
  amount: number;
  date: string;
  category: string;
  icon: string;
  card: string | null;
  installmentCount: number | null;
  transcript: string;
};

const pad = (value: number) => String(value).padStart(2, "0");
const formatDate = (date: Date) => `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function moneyToNumber(raw: string): number {
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function parseAmount(text: string): number {
  // Prioriza expressões inequivocamente monetárias para não confundir
  // "3 parcelas" / "3x" / datas com o valor da transação.
  const explicit = text.match(/(?:r\$\s*)(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i)
    || text.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais?|real)\b/i);
  if (explicit) return moneyToNumber(explicit[1]);

  // Fallback para fala curta, ex.: "Padaria 25". Ignora número de parcelas e datas.
  const candidates = Array.from(text.matchAll(/\b(\d+(?:[.,]\d{1,2})?)\b/g));
  for (const candidate of candidates) {
    const raw = candidate[1];
    const index = candidate.index ?? 0;
    const around = text.slice(Math.max(0, index - 3), index + raw.length + 12);
    if (/\d+\s*(?:x|parcelas?)\b/i.test(around)) continue;
    if (/\d{1,2}[\/-]\d{1,2}/.test(around)) continue;
    return moneyToNumber(raw);
  }
  return 0;
}

function parseDate(text: string, now = new Date()): string {
  const normalized = normalize(text);
  const explicit = text.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (explicit) {
    let year = explicit[3] ? Number(explicit[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    return `${pad(Number(explicit[1]))}-${pad(Number(explicit[2]))}-${year}`;
  }

  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (normalized.includes("anteontem")) date.setDate(date.getDate() - 2);
  else if (normalized.includes("ontem")) date.setDate(date.getDate() - 1);
  return formatDate(date);
}

function parseCard(text: string): string | null {
  const match = text.match(/\bcart[aã]o\s+(.+?)(?=\s+(?:categoria\b|em\s+\d{1,2}\s*(?:x|parcelas?)\b|\d{1,2}\s*(?:x|parcelas?)\b|hoje\b|ontem\b|anteontem\b|no\s+dia\b|dia\s+\d|$)|[,.]|$)/i);
  if (!match) return null;
  return match[1].trim().replace(/[,.]+$/, "") || null;
}

function parseInstallments(text: string): number | null {
  const match = text.match(/\b(?:em\s+)?(\d{1,2})\s*(?:x|parcelas?)\b/i);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isInteger(count) && count >= 2 && count <= 48 ? count : null;
}

function inferCategory(name: string, spokenCategory: string | null, type: VoiceTransactionType) {
  if (type === "income") {
    const category = spokenCategory ? `Receita > ${spokenCategory}` : "Receita > Outros";
    return { category, icon: "💰" };
  }

  if (spokenCategory) {
    const categoryNorm = normalize(spokenCategory);
    if (categoryNorm.includes("transport")) return { category: "Transporte > Outros", icon: "🚗" };
    if (categoryNorm.includes("aliment")) return { category: "Alimentação > Outros", icon: "🍔" };
    if (categoryNorm.includes("saude")) return { category: "Saúde > Outros", icon: "💊" };
    if (categoryNorm.includes("moradia")) return { category: "Moradia > Outros", icon: "🏠" };
    if (categoryNorm.includes("compra")) return { category: "Compras > Outros", icon: "🛍️" };
  }

  const n = normalize(name);
  if (/posto|gasolina|combustivel|etanol|diesel/.test(n)) return { category: "Transporte > Combustível", icon: "⛽" };
  if (/farmacia|remedio|medicamento/.test(n)) return { category: "Saúde > Farmácia", icon: "💊" };
  if (/mercado|supermercado|padaria|restaurante|lanchonete|ifood|delivery/.test(n)) return { category: "Alimentação > Outros", icon: "🍔" };
  if (/aluguel|condominio|energia|luz|agua|internet/.test(n)) return { category: "Moradia > Outros", icon: "🏠" };
  return { category: "Outros > Outros", icon: "📄" };
}

function extractName(text: string): string {
  let value = text.trim();
  value = value.replace(/^\s*(?:eu\s+)?(?:gastei|paguei|comprei|adquiri|recebi|ganhei|entrou|caiu)\s+/i, "");
  value = value.replace(/(?:r\$\s*)\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|(?:r\$\s*)\d+(?:[.,]\d{1,2})?/i, " ");
  value = value.replace(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\s*(?:reais?|real)\b|\d+(?:[.,]\d{1,2})?\s*(?:reais?|real)\b/i, " ");
  value = value.replace(/\b(?:no|na|pelo|pela|com\s+o|com\s+a)?\s*cart[aã]o\s+.+?(?=\s+(?:categoria\b|em\s+\d{1,2}\s*(?:x|parcelas?)\b|\d{1,2}\s*(?:x|parcelas?)\b|hoje\b|ontem\b|anteontem\b|no\s+dia\b|dia\s+\d|$)|[,.]|$)/i, " ");
  value = value.replace(/\bcategoria\s+.+?(?=\s+(?:em\s+\d{1,2}\s*(?:x|parcelas?)\b|\d{1,2}\s*(?:x|parcelas?)\b|hoje\b|ontem\b|anteontem\b|no\s+dia\b|dia\s+\d|$)|[,.]|$)/i, " ");
  value = value.replace(/\b(?:em\s+)?\d{1,2}\s*(?:x|parcelas?)\b/gi, " ");
  value = value.replace(/\b(?:hoje|ontem|anteontem)\b/gi, " ");
  value = value.replace(/\b(?:no\s+dia|dia)\s+\d{1,2}(?:[\/-]\d{1,2})?(?:[\/-]\d{2,4})?\b/gi, " ");
  value = value.replace(/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/g, " ");
  value = value.replace(/[,.]/g, " ").replace(/\s+/g, " ").trim();
  value = value.replace(/^(?:no|na|em|com|do|da|para|por)\s+/i, "");
  value = value.replace(/\s+(?:no|na|em|com|do|da|para|por)$/i, "").trim();
  if (!value) return "Transação por voz";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function parseVoiceTransaction(transcript: string, now = new Date()): VoiceTransactionDraft {
  const normalized = normalize(transcript);
  const type: VoiceTransactionType = /\b(recebi|ganhei|entrou|caiu|receita|salario|reembolso)\b/.test(normalized)
    ? "income"
    : "expense";

  const spokenCategoryMatch = transcript.match(/\bcategoria\s+(.+?)(?=\s+(?:em\s+\d{1,2}\s*(?:x|parcelas?)\b|\d{1,2}\s*(?:x|parcelas?)\b|hoje\b|ontem\b|anteontem\b|no\s+dia\b|dia\s+\d|$)|[,.]|$)/i);
  const spokenCategory = spokenCategoryMatch?.[1]?.trim() || null;
  const name = extractName(transcript);
  const inferred = inferCategory(name, spokenCategory, type);

  return {
    type,
    name,
    amount: parseAmount(transcript),
    date: parseDate(transcript, now),
    category: inferred.category,
    icon: inferred.icon,
    card: parseCard(transcript),
    installmentCount: parseInstallments(transcript),
    transcript: transcript.trim(),
  };
}
