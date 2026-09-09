export type VoiceTransactionType = "expense" | "income";

export type VoiceTransactionDraft = {
  type: VoiceTransactionType;
  name: string;
  amount: number;
  date: string;
  category: string;
  icon: string;
  card: string | null;
  bankAccount: string | null;
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

const NUMBER_WORD_VALUES: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezassete: 17,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900,
};

const NUMBER_WORD_TOKEN = [
  "zero", "um", "uma", "dois", "duas", "tr[eê]s", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "catorze", "quatorze", "quinze", "dezesseis", "dezassete", "dezessete", "dezoito", "dezenove",
  "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa",
  "cem", "cento", "duzent[oa]s", "trezent[oa]s", "quatrocent[oa]s", "quinhent[oa]s", "seiscent[oa]s", "setecent[oa]s", "oitocent[oa]s", "novecent[oa]s", "mil",
].join("|");

const NUMBER_WORD_SEQUENCE = `(?:(?:${NUMBER_WORD_TOKEN})(?:\\s+e\\s+|\\s+)){0,10}(?:${NUMBER_WORD_TOKEN})`;
const NUMBER_WORD_MONEY_RE = new RegExp(`\\b(${NUMBER_WORD_SEQUENCE})\\s+reais?\\b`, "i");
const VALUE_WORDS_RE = new RegExp(`\\b(?:no\\s+valor\\s+de|valor\\s+de|valor|por)\\s+(${NUMBER_WORD_SEQUENCE})(?:\\s+reais?)?\\b`, "i");

function parsePortugueseNumberWords(raw: string): number | null {
  const tokens = normalize(raw).split(" ").filter(Boolean);
  if (!tokens.length) return null;

  let total = 0;
  let current = 0;
  let recognized = 0;

  for (const token of tokens) {
    if (token === "e") continue;
    if (token === "mil") {
      current = current || 1;
      total += current * 1000;
      current = 0;
      recognized += 1;
      continue;
    }
    const value = NUMBER_WORD_VALUES[token];
    if (value === undefined) return null;
    current += value;
    recognized += 1;
  }

  return recognized ? total + current : null;
}

function moneyToNumber(raw: string): number {
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function parseAmount(text: string): number {
  // Expressões monetárias explícitas têm prioridade e evitam confundir
  // número de parcelas, datas e outros números citados numa fala longa.
  const numeric = text.match(/(?:r\$\s*)(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i)
    || text.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais?|real)\b/i)
    || text.match(/\b(?:no\s+valor\s+de|valor\s+de|valor)\s+(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
  if (numeric) return moneyToNumber(numeric[1]);

  const wordMoney = text.match(NUMBER_WORD_MONEY_RE) || text.match(VALUE_WORDS_RE);
  if (wordMoney) {
    const whole = parsePortugueseNumberWords(wordMoney[1]);
    if (whole !== null) {
      const after = text.slice((wordMoney.index ?? 0) + wordMoney[0].length);
      const centsMatch = after.match(/^\s*(?:e\s+)?(.+?)\s+centavos?\b/i);
      const cents = centsMatch ? parsePortugueseNumberWords(centsMatch[1]) : null;
      return whole + (cents !== null && cents >= 0 && cents < 100 ? cents / 100 : 0);
    }
  }

  // Só usa número solto como fallback em comandos curtos. Em fala longa,
  // é mais seguro deixar o valor zerado para revisão do que escolher um número aleatório.
  if (text.trim().split(/\s+/).length <= 8) {
    const candidates = Array.from(text.matchAll(/\b(\d+(?:[.,]\d{1,2})?)\b/g));
    for (const candidate of candidates) {
      const raw = candidate[1];
      const index = candidate.index ?? 0;
      const around = text.slice(Math.max(0, index - 4), index + raw.length + 14);
      if (/\d+\s*(?:x|parcelas?)\b/i.test(around)) continue;
      if (/\d{1,2}[\/-]\d{1,2}/.test(around)) continue;
      if (/^\s*%/.test(text.slice(index + raw.length, index + raw.length + 3))) continue;
      return moneyToNumber(raw);
    }
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

const METADATA_BOUNDARY = String.raw`(?:no\s+valor\b|valor\b|por\s+(?:r\$|\d)|cart[aã]o\b|conta(?:\s+banc[aá]ria)?\b|categoria\b|em\s+(?:\d+|${NUMBER_WORD_TOKEN})\s*(?:x|parcelas?)\b|hoje\b|ontem\b|anteontem\b|data\b|dia\s+\d)`;

function parseCard(text: string): string | null {
  const match = text.match(new RegExp(`\\bcart[aã]o(?:\\s+de\\s+cr[eé]dito)?\\s+(?:do|da|é|e)?\\s*(.+?)(?=\\s+(?:${METADATA_BOUNDARY})|[,.]|$)`, "i"));
  if (!match) return null;
  const card = match[1].trim().replace(/[,.]+$/, "");
  return card && card.length <= 50 ? card : null;
}

function parseBankAccount(text: string): string | null {
  const match = text.match(new RegExp(
    `\\bconta(?:\\s+banc[aá]ria)?\\s+(?:(?:do|da|de)\\s+)?(.+?)(?=\\s+(?:${METADATA_BOUNDARY})|[,.]|$)`,
    "i",
  ));
  if (!match) return null;
  const account = match[1].trim().replace(/[,.]+$/, "");
  return account && account.length <= 80 ? account : null;
}

function parseInstallments(text: string): number | null {
  const numeric = text.match(/\b(?:em\s+)?(\d{1,2})\s*(?:x|parcelas?)\b/i);
  if (numeric) {
    const count = Number(numeric[1]);
    return Number.isInteger(count) && count >= 2 && count <= 48 ? count : null;
  }

  const words = text.match(new RegExp(`\\b(?:em\\s+)?(${NUMBER_WORD_SEQUENCE})\\s+parcelas?\\b`, "i"));
  if (!words) return null;
  const count = parsePortugueseNumberWords(words[1]);
  return count !== null && Number.isInteger(count) && count >= 2 && count <= 48 ? count : null;
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
  if (/mecanica|mecanico|oficina|auto center|auto-center/.test(n)) return { category: "Transporte > Manutenção", icon: "🔧" };
  if (/posto|gasolina|combustivel|etanol|diesel/.test(n)) return { category: "Transporte > Combustível", icon: "⛽" };
  if (/farmacia|remedio|medicamento/.test(n)) return { category: "Saúde > Farmácia", icon: "💊" };
  if (/padaria|cafe/.test(n)) return { category: "Alimentação > Padaria/Café", icon: "☕" };
  if (/mercado|supermercado/.test(n)) return { category: "Alimentação > Supermercado", icon: "🛒" };
  if (/restaurante|lanchonete|ifood|delivery/.test(n)) return { category: "Alimentação > Outros", icon: "🍔" };
  if (/aluguel|condominio|energia|luz|agua|internet/.test(n)) return { category: "Moradia > Outros", icon: "🏠" };
  return { category: "Outros > Outros", icon: "📄" };
}

function cleanNameCandidate(raw: string): string {
  let value = raw
    .replace(/[,.!?;:]+$/g, "")
    .replace(/^\s*(?:uma?\s+)?(?:transa[cç][aã]o|despesa|compra|gasto|receita)\s+(?:chamad[ao]\s+|com\s+o\s+nome\s+)?/i, "")
    .replace(/^\s*(?:no|na|em|do|da|para|por)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!value || value.split(" ").length > 12 || value.length > 80) return "Transação por voz";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function findMoneyPosition(text: string): { start: number; end: number } | null {
  const patterns = [
    /(?:r\$\s*)(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i,
    /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais?|real)\b/i,
    /\b(?:no\s+valor\s+de|valor\s+de|valor)\s+(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i,
    NUMBER_WORD_MONEY_RE,
    VALUE_WORDS_RE,
  ];
  const found = patterns
    .map((pattern) => text.match(pattern))
    .filter((match): match is RegExpMatchArray => !!match && match.index !== undefined)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0];
  if (!found || found.index === undefined) return null;
  return { start: found.index, end: found.index + found[0].length };
}

function extractName(text: string): string {
  const explicit = text.match(new RegExp(
    `\\b(?:nome(?:\\s+da)?(?:\\s+transa[cç][aã]o)?|descri[cç][aã]o)\\s*(?:é|e|vai\\s+ser|ser[aá]|:|=)?\\s*(?:de\\s+)?(.+?)(?=\\s+(?:${METADATA_BOUNDARY})|[,.]|$)`,
    "i",
  ));
  if (explicit?.[1]) return cleanNameCandidate(explicit[1]);

  const money = findMoneyPosition(text);
  if (money) {
    const beforeMoney = text.slice(0, money.start);
    const intent = beforeMoney.match(/\b(?:gastei|paguei|comprei|adquiri|recebi|ganhei|lancei|registrei|adicionei|lance|registre|adicione)\b\s+(.+)$/i);
    if (intent?.[1]) {
      const candidate = intent[1]
        .replace(/\b(?:no\s+valor\s+de|valor\s+de|valor|por)\s*$/i, "")
        .trim();
      const cleaned = cleanNameCandidate(candidate);
      if (cleaned !== "Transação por voz") return cleaned;
    }

    const afterMoney = text.slice(money.end);
    const post = afterMoney
      .split(new RegExp(`\\s+(?=${METADATA_BOUNDARY})|[,.]`, "i"))[0]
      ?.trim();
    if (post) {
      const cleaned = cleanNameCandidate(post);
      if (cleaned !== "Transação por voz") return cleaned;
    }
  }

  // Em comandos longos sem estrutura clara não copiamos a fala inteira para o nome.
  // Isso força uma revisão segura em vez de gravar um texto enorme como descrição.
  const compact = text.trim().replace(/\s+/g, " ");
  if (compact.split(" ").length <= 7 && compact.length <= 80) {
    const short = compact
      .replace(/^\s*(?:eu\s+)?(?:quero\s+)?(?:adicionar|registrar|lan[cç]ar)?\s*(?:uma?\s+)?(?:transa[cç][aã]o|despesa|receita)?\s*/i, "")
      .trim();
    if (short) return cleanNameCandidate(short);
  }
  return "Transação por voz";
}

export function parseVoiceTransaction(transcript: string, now = new Date()): VoiceTransactionDraft {
  const normalized = normalize(transcript);
  const isYield = /\b(rendimentos?|juros?|rentabilidade)\b/.test(normalized);
  const type: VoiceTransactionType = isYield || /\b(recebi|ganhei|entrou|caiu|receita|salario|reembolso)\b/.test(normalized)
    ? "income"
    : "expense";

  const spokenCategoryMatch = transcript.match(new RegExp(
    `\\bcategoria\\s+(?:é|e|:)?\\s*(.+?)(?=\\s+(?:${METADATA_BOUNDARY})|[,.]|$)`,
    "i",
  ));
  const spokenCategory = spokenCategoryMatch?.[1]?.trim() || null;
  const name = isYield ? "Rendimento" : extractName(transcript);
  const inferred = isYield
    ? { category: "Receita > Juros", icon: "📈" }
    : inferCategory(name, spokenCategory, type);

  return {
    type,
    name,
    amount: parseAmount(transcript),
    date: parseDate(transcript, now),
    category: inferred.category,
    icon: inferred.icon,
    card: parseCard(transcript),
    bankAccount: parseBankAccount(transcript),
    installmentCount: parseInstallments(transcript),
    transcript: transcript.trim(),
  };
}
