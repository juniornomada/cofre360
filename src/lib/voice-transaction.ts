export type VoiceTransactionType = "expense" | "income";

export type VoiceTransactionDraft = {
  type: VoiceTransactionType;
  name: string;
  amount: number;
  date: string;
  category: string;
  categorySource?: "spoken" | "inferred";
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

function normalizeSpokenNumberWords(value: string): string {
  const tokens = value.split(" ").filter(Boolean);
  const normalizedTokens: string[] = [];

  for (let index = 0; index < tokens.length;) {
    const token = tokens[index];
    const isNumberWord = token === "mil" || NUMBER_WORD_VALUES[token] !== undefined;

    if (!isNumberWord) {
      normalizedTokens.push(token);
      index += 1;
      continue;
    }

    const sequence: string[] = [token];
    let cursor = index + 1;

    while (cursor < tokens.length) {
      const next = tokens[cursor];
      const nextIsNumberWord = next === "mil" || NUMBER_WORD_VALUES[next] !== undefined;
      if (!nextIsNumberWord && next !== "e") break;
      sequence.push(next);
      cursor += 1;
    }

    while (sequence[sequence.length - 1] === "e") {
      sequence.pop();
      cursor -= 1;
    }

    const parsed = parsePortugueseNumberWords(sequence.join(" "));
    if (parsed !== null) {
      normalizedTokens.push(String(parsed));
      index = cursor;
      continue;
    }

    normalizedTokens.push(token);
    index += 1;
  }

  return normalizedTokens.join(" ");
}

export const normalizeVoiceAccountReference = (value: string) =>
  normalizeSpokenNumberWords(
    normalize(value)
      .replace(/\bpor cento\b/g, "")
      .replace(/%/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

export const normalizeVoiceCardReference = (value: string) =>
  normalize(value)
    .replace(/[^a-z0-9]+/g, "");

export const voiceCardNamesMatch = (spoken: string, saved: string) =>
  normalizeVoiceCardReference(spoken) === normalizeVoiceCardReference(saved);

function canonicalizeVoiceAccountAlias(value: string): string {
  const normalized = normalizeVoiceAccountReference(value);

  // Conta de benefício/ticket alimentação cadastrada como "Caixa CA CR (2508)".
  // Aceita formas naturais de fala sem tornar "Caixa" sozinho ambíguo.
  if (
    /^caixa\s+(?:ca|alimentacao|ticket\s+alimentacao|vale\s+alimentacao)$/.test(normalized) ||
    /^caixa\s+ca\s+cr(?:\s+2508)?$/.test(normalized)
  ) {
    return "caixa alimentacao";
  }

  return normalized;
}

export const voiceAccountNamesMatch = (
  spoken: string,
  saved: string,
  parentName?: string | null,
) => {
  const spokenRef = canonicalizeVoiceAccountAlias(spoken);
  const savedRef = canonicalizeVoiceAccountAlias(saved);

  if (spokenRef === savedRef) return true;
  if (!parentName) return false;

  const hierarchicalRef = canonicalizeVoiceAccountAlias(`${parentName} ${saved}`);
  return spokenRef === hierarchicalRef;
};

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
const VALUE_WORDS_RE = new RegExp(`\\b(?:no\\s+valor\\s+de|valor\\s+de|valor|por)\\s*(?:[,;:=\\-]\\s*)?(${NUMBER_WORD_SEQUENCE})(?:\\s+reais?)?\\b`, "i");
const FLEXIBLE_NUMBER_PART = `(?:${NUMBER_WORD_SEQUENCE}|\\d{1,3}(?:\\.\\d{3})*|\\d+)`;
const REALS_AND_CENTS_RE = new RegExp(
  `\\b(${FLEXIBLE_NUMBER_PART})\\s+reais?\\s+e\\s+(${FLEXIBLE_NUMBER_PART})\\s+centavos?\\b`,
  "i",
);
const SPOKEN_DECIMAL_RE = new RegExp(
  `\\b(${FLEXIBLE_NUMBER_PART})\\s+(?:pontos?|v[ií]rgulas?)\\s+(${FLEXIBLE_NUMBER_PART})\\b`,
  "i",
);
const VALUE_SPOKEN_DECIMAL_RE = new RegExp(
  `\\b(?:no\\s+valor\\s+de|valor\\s+de|valor|por)\\s*(?:[,;:=\\-]\\s*)?(${FLEXIBLE_NUMBER_PART})\\s+(?:pontos?|v[ií]rgulas?)\\s+(${FLEXIBLE_NUMBER_PART})\\b`,
  "i",
);
const VALUE_REALS_AND_CENTS_RE = new RegExp(
  `\\b(?:no\\s+valor\\s+de|valor\\s+de|valor|por)\\s*(?:[,;:=\\-]\\s*)?(${FLEXIBLE_NUMBER_PART})\\s+reais?\\s+e\\s+(${FLEXIBLE_NUMBER_PART})\\s+centavos?\\b`,
  "i",
);


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

function parseFlexibleNumber(raw: string): number | null {
  const compact = raw.trim();
  if (/^\d+(?:[.,]\d+)?$/.test(compact) || /^\d{1,3}(?:\.\d{3})+$/.test(compact)) {
    return moneyToNumber(compact);
  }
  return parsePortugueseNumberWords(compact);
}

function parseSpokenDecimalFraction(raw: string): number | null {
  const compact = normalize(raw);

  if (/^\d{1,2}$/.test(compact)) {
    const digits = Number(compact);
    return digits / (compact.length === 1 ? 10 : 100);
  }

  const value = parsePortugueseNumberWords(compact);
  if (value === null || value < 0 || value > 99) return null;

  // Em fala monetária, "ponto cinco" equivale a 0,5 e
  // "ponto noventa e sete" equivale a 0,97.
  if (/^zero\b/.test(compact)) return value / 100;
  return value < 10 ? value / 10 : value / 100;
}

function parseCompositeMoney(text: string): number | null {
  const reaisAndCents = text.match(VALUE_REALS_AND_CENTS_RE) || text.match(REALS_AND_CENTS_RE);
  if (reaisAndCents) {
    const reais = parseFlexibleNumber(reaisAndCents[1]);
    const cents = parseFlexibleNumber(reaisAndCents[2]);
    if (reais !== null && cents !== null && cents >= 0 && cents < 100) {
      return reais + cents / 100;
    }
  }

  const spokenDecimal = text.match(VALUE_SPOKEN_DECIMAL_RE) || text.match(SPOKEN_DECIMAL_RE);
  if (spokenDecimal) {
    const whole = parseFlexibleNumber(spokenDecimal[1]);
    const fraction = parseSpokenDecimalFraction(spokenDecimal[2]);
    if (whole !== null && fraction !== null) {
      return whole + fraction;
    }
  }

  return null;
}

function parseAmount(text: string): number {
  const composite = parseCompositeMoney(text);
  if (composite !== null) return composite;

  const numericCents = text.match(/\b(?:(?:no\s+valor\s+de|valor\s+de|valor|por)\s*(?:[,;:=\-]\s*)?)?(\d{1,2})\s+centavos?\b/i);
  if (numericCents) return Number(numericCents[1]) / 100;

  const wordCents = text.match(new RegExp(`\\b(?:(?:no\\s+valor\\s+de|valor\\s+de|valor|por)\\s*(?:[,;:=\\-]\\s*)?)?(${NUMBER_WORD_SEQUENCE})\\s+centavos?\\b`, "i"));
  if (wordCents) {
    const centsValue = parsePortugueseNumberWords(wordCents[1]);
    if (centsValue !== null && centsValue >= 0 && centsValue < 100) return centsValue / 100;
  }

  const conversationalNumeric = text.match(
    /\b(?:gastei|paguei|comprei|adquiri|recebi|ganhei|lancei|registrei|adicionei)\s+(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\b/i,
  );
  if (conversationalNumeric) return moneyToNumber(conversationalNumeric[1]);

  const numeric = text.match(/(?:r\$\s*)(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i)
    || text.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais?|real)\b/i)
    || text.match(/\b(?:no\s+valor\s+de|valor\s+de|valor)\s*(?:[,;:=\-]\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
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

  // Quando o conteúdo já veio do campo explícito "valor", a transcrição pode
  // trazer apenas o número por extenso, sem repetir "reais".
  const bareWordAmount = parsePortugueseNumberWords(text);
  if (bareWordAmount !== null) return bareWordAmount;

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

const METADATA_BOUNDARY = String.raw`(?:no\s+valor\b|valor\b|por\s+(?:r\$|\d)|cart[aã]o\b|conta(?:\s+banc[aá]ria)?\b|categoria\b|refer[eê]ncia\b|em\s+(?:\d+|${NUMBER_WORD_TOKEN})\s*(?:x|parcelas?)\b|hoje\b|ontem\b|anteontem\b|data\b|dia\s+\d)`;

function parseCard(text: string): string | null {
  const match = text.match(new RegExp(
    `\\bcart[aã]o(?:\\s+de\\s+cr[eé]dito)?\\s*(?:[,;:=\\-]\\s*)?(?:(?:do|da|de|é|e)\\s+)?(.+?)(?=\\s*(?:[,;.]\\s*)?(?:${METADATA_BOUNDARY}|${VOICE_FINALIZATION_BOUNDARY})\\b|[.!?]|$)`,
    "i",
  ));
  if (!match) return null;
  const card = match[1]
    .trim()
    .replace(/[,;]+/g, " ")
    .replace(/\\s+/g, " ")
    .replace(/[.!?]+$/, "")
    .trim();
  return card && card.length <= 50 ? card : null;
}

const VOICE_FINALIZATION_BOUNDARY = String.raw`(?:confirmar|finalizar|lan[cç]ar|lan[cç]a|lance|ok)`;

type StructuredVoiceFieldKey =
  | "name"
  | "reference"
  | "category"
  | "value"
  | "bankAccount"
  | "card"
  | "date";

type StructuredVoiceFields = Partial<Record<StructuredVoiceFieldKey, string>>;

const STRUCTURED_FIELD_LABEL_RE =
  /\b(nome(?:\s+da\s+transa[cç][aã]o)?|descri[cç][aã]o|refer[eê]ncia|categoria|no\s+valor(?:\s+de)?|valor(?:\s+de)?|conta(?:\s+banc[aá]ria)?|cart[aã]o(?:\s+de\s+cr[eé]dito)?|data)\b\s*(?:[,;:=\-]\s*)?/gi;

function structuredVoiceFieldKey(label: string): StructuredVoiceFieldKey | null {
  const normalized = normalize(label);
  if (normalized.startsWith("nome") || normalized.startsWith("descricao")) return "name";
  if (normalized.startsWith("referencia")) return "reference";
  if (normalized.startsWith("categoria")) return "category";
  if (normalized.includes("valor")) return "value";
  if (normalized.startsWith("conta")) return "bankAccount";
  if (normalized.startsWith("cartao")) return "card";
  if (normalized === "data") return "date";
  return null;
}

function cleanStructuredVoiceFieldValue(raw: string, key: StructuredVoiceFieldKey): string {
  let value = raw
    .replace(
      /\s+(?:(?:pode\s+)?(?:confirmar|finalizar|lan[cç]ar|lan[cç]a|lance|ok))(?:\s+(?:a\s+)?transa[cç][aã]o)?\s*[.!?,;:]*$/i,
      "",
    )
    .replace(/^[\s,;:.=\-]+|[\s,;:.=\-]+$/g, "")
    .replace(/^\s*(?:é|e|vai\s+ser|ser[aá])\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (key === "card" || key === "bankAccount") {
    const installmentTail = new RegExp(
      `\\s+(?=(?:parcelad[oa]\\s+em\\s+|em\\s+)?(?:\\d{1,2}|${NUMBER_WORD_SEQUENCE})\\s*(?:x|vezes?|parcelas?)\\b|parcelas?\\s*(?:[,;:=\\-]\\s*)?(?:\\d{1,2}|${NUMBER_WORD_SEQUENCE})\\b)`,
      "i",
    );

    value = value
      .split(installmentTail)[0]
      .replace(/^\s*(?:do|da|de)\s+/i, "")
      .replace(/[,;]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return value;
}

function extractStructuredVoiceFields(text: string): StructuredVoiceFields {
  const matches = Array.from(text.matchAll(STRUCTURED_FIELD_LABEL_RE));
  if (!matches.length) return {};

  const fields: StructuredVoiceFields = {};

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match.index === undefined) continue;

    const key = structuredVoiceFieldKey(match[1]);
    if (!key || fields[key]) continue;

    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    let value = cleanStructuredVoiceFieldValue(text.slice(start, end), key);

    if (index + 1 < matches.length) {
      value = value.replace(/\s+(?:na|no|em)$/i, "").trim();
    }

    if (value) fields[key] = value;
  }

  return fields;
}

function parseBankAccount(text: string): string | null {
  const match = text.match(new RegExp(
    `\\bconta(?:\\s+banc[aá]ria)?\\s*(?:[,;:=\\-]\\s*)?(?:(?:do|da|de)\\s+)?(.+?)(?=\\s*(?:[,;.]\\s*)?(?:(?:na|no|em)\\s+)?(?:${METADATA_BOUNDARY}|${VOICE_FINALIZATION_BOUNDARY})\\b|[.!?]|$)`,
    "i",
  ));
  if (!match) return null;
  const account = match[1]
    .trim()
    .replace(/[,;]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "")
    .trim();
  return account && account.length <= 80 ? account : null;
}

function canonicalizeKnownReference(value: string): string {
  const normalized = normalize(value);
  if (normalized === "mae") return "mãe";
  if (normalized === "pai") return "pai";
  if (normalized === "creta") return "Creta";
  if (normalized === "spacefox" || normalized === "space fox") return "Spacefox";
  return value;
}

function parseReference(text: string): string | null {
  const match = text.match(new RegExp(
    `\\brefer[eê]ncia\\s*(?:[,;:=\\-]\\s*)?(?:é|e)?\\s*(.+?)(?=\\s+(?:(?:na|no|em)\\s+)?(?:${METADATA_BOUNDARY})|[,.]|$)`,
    "i",
  ));
  if (!match) return null;
  const reference = match[1]
    .trim()
    .replace(/^[()]+|[(),.!?;:]+$/g, "")
    .replace(/\s+/g, " ");
  if (!reference || reference.length > 40 || reference.split(" ").length > 6) return null;
  return canonicalizeKnownReference(reference);
}

function parseInstallments(text: string): number | null {
  const numeric =
    text.match(/\bparcelad[oa]\s+em\s+(\d{1,2})\s*(?:x|vezes?|parcelas?)\b/i) ||
    text.match(/\bem\s+(\d{1,2})\s*(?:x|vezes?|parcelas?)\b/i) ||
    text.match(/\b(\d{1,2})\s*(?:x|vezes?|parcelas?)\b/i) ||
    text.match(/\bparcelas?\s*(?:[,;:=\-]\s*)?(\d{1,2})\b/i);
  if (numeric) {
    const count = Number(numeric[1]);
    return Number.isInteger(count) && count >= 2 && count <= 48 ? count : null;
  }

  const words =
    text.match(new RegExp(`\\bparcelad[oa]\\s+em\\s+(${NUMBER_WORD_SEQUENCE})\\s+(?:vezes?|parcelas?)\\b`, "i")) ||
    text.match(new RegExp(`\\bem\\s+(${NUMBER_WORD_SEQUENCE})\\s+(?:vezes?|parcelas?)\\b`, "i")) ||
    text.match(new RegExp(`\\b(${NUMBER_WORD_SEQUENCE})\\s+(?:vezes?|parcelas?)\\b`, "i")) ||
    text.match(new RegExp(`\\bparcelas?\\s*(?:[,;:=\\-]\\s*)?(${NUMBER_WORD_SEQUENCE})\\b`, "i"));
  if (!words) return null;
  const count = parsePortugueseNumberWords(words[1]);
  return count !== null && Number.isInteger(count) && count >= 2 && count <= 48 ? count : null;
}

function inferCategory(name: string, spokenCategory: string | null, type: VoiceTransactionType) {
  const n = normalize(name);
  const spoken = spokenCategory ? normalize(spokenCategory) : null;

  if (type === "income") {
    const signal = spoken || n;
    if (/\bsalario\b|\bordenado\b/.test(signal)) return { category: "Receita > Salário", icon: "💼" };
    if (/\bfreelance\b|\bfreela\b/.test(signal)) return { category: "Receita > Freelance", icon: "💻" };
    if (/\bjuros?\b|\brendimentos?\b|\brentabilidade\b/.test(signal)) return { category: "Receita > Juros", icon: "📈" };
    if (/\breembolso\b|\bestorno\b/.test(signal)) return { category: "Receita > Reembolso", icon: "↩️" };
    return { category: "Receita > Outros", icon: "💰" };
  }

  if (spoken) {
    if (/pedagio/.test(spoken)) return { category: "Transporte > Pedágio", icon: "🛣️" };
    if (/combustivel|gasolina|etanol|diesel/.test(spoken)) return { category: "Transporte > Combustível", icon: "⛽" };
    if (/manutencao|mecanica|oficina/.test(spoken)) return { category: "Transporte > Manutenção", icon: "🔧" };
    if (/estacionamento/.test(spoken)) return { category: "Transporte > Estacionamento", icon: "🅿️" };
    if (/uber|\b99\b/.test(spoken)) return { category: "Transporte > Uber/99", icon: "🚕" };
    if (spoken.includes("transport")) return { category: "Transporte > Outros", icon: "🚗" };
    if (/supermercado|mercado/.test(spoken)) return { category: "Alimentação > Supermercado", icon: "🛒" };
    if (/padaria|cafe/.test(spoken)) return { category: "Alimentação > Padaria/Café", icon: "☕" };
    if (/delivery|ifood/.test(spoken)) return { category: "Alimentação > Delivery", icon: "🛵" };
    if (/restaurante|lanchonete/.test(spoken)) return { category: "Alimentação > Restaurante", icon: "🍽️" };
    if (spoken.includes("aliment")) return { category: "Alimentação > Outros", icon: "🍔" };
    if (/farmacia/.test(spoken)) return { category: "Saúde > Farmácia", icon: "💊" };
    if (spoken.includes("saude")) return { category: "Saúde > Outros", icon: "💊" };
    if (/aluguel/.test(spoken)) return { category: "Moradia > Aluguel", icon: "🏠" };
    if (/condominio/.test(spoken)) return { category: "Moradia > Condomínio", icon: "🏢" };
    if (/energia|\bluz\b/.test(spoken)) return { category: "Moradia > Energia", icon: "⚡" };
    if (/\bagua\b/.test(spoken)) return { category: "Moradia > Água", icon: "💧" };
    if (/internet|telefone/.test(spoken)) return { category: "Moradia > Internet/Telefone", icon: "📶" };
    if (spoken.includes("moradia")) return { category: "Moradia > Outros", icon: "🏠" };
    if (/eletronicos?|eletronica/.test(spoken)) return { category: "Compras > Eletrônicos", icon: "📱" };
    if (spoken.includes("compra")) return { category: "Compras > Outros", icon: "🛍️" };
  }

  if (/mecanica|mecanico|oficina|auto center|auto-center/.test(n)) return { category: "Transporte > Manutenção", icon: "🔧" };
  if (/posto|gasolina|combustivel|etanol|diesel/.test(n)) return { category: "Transporte > Combustível", icon: "⛽" };
  if (/pedagio/.test(n)) return { category: "Transporte > Pedágio", icon: "🛣️" };
  if (/estacionamento/.test(n)) return { category: "Transporte > Estacionamento", icon: "🅿️" };
  if (/\buber\b|\b99\b/.test(n)) return { category: "Transporte > Uber/99", icon: "🚕" };
  if (/farmacia|remedio|medicamento/.test(n)) return { category: "Saúde > Farmácia", icon: "💊" };
  if (/padaria|cafe/.test(n)) return { category: "Alimentação > Padaria/Café", icon: "☕" };
  if (/mercado|supermercado/.test(n)) return { category: "Alimentação > Supermercado", icon: "🛒" };
  if (/ifood|delivery/.test(n)) return { category: "Alimentação > Delivery", icon: "🛵" };
  if (/restaurante|lanchonete/.test(n)) return { category: "Alimentação > Restaurante", icon: "🍽️" };
  if (/aluguel/.test(n)) return { category: "Moradia > Aluguel", icon: "🏠" };
  if (/condominio/.test(n)) return { category: "Moradia > Condomínio", icon: "🏢" };
  if (/energia|\bluz\b/.test(n)) return { category: "Moradia > Energia", icon: "⚡" };
  if (/\bagua\b/.test(n)) return { category: "Moradia > Água", icon: "💧" };
  if (/internet|telefone/.test(n)) return { category: "Moradia > Internet/Telefone", icon: "📶" };
  return { category: "Outros > Outros", icon: "📄" };
}

function normalizeProductMeasurements(value: string): string {
  const inchesPattern = new RegExp(
    `\\b(?:de\\s+)?(\\d{1,3}|${NUMBER_WORD_SEQUENCE})\\s+polegadas?\\b`,
    "gi",
  );

  return value.replace(inchesPattern, (_match, rawSize: string) => {
    const numericSize = /^\d+$/.test(rawSize.trim())
      ? Number(rawSize)
      : parsePortugueseNumberWords(rawSize);

    if (numericSize === null || !Number.isFinite(numericSize) || numericSize <= 0) {
      return _match;
    }

    return `${numericSize}"`;
  });
}

function cleanNameCandidate(raw: string): string {
  let value = raw
    .replace(/^[,.!?;:\s]+/g, "")
    .replace(/[,.!?;:]+$/g, "")
    .replace(/^\s*(?:uma?\s+)?(?:transa[cç][aã]o|despesa|compra|gasto|receita)\s+(?:chamad[ao]\s+|com\s+o\s+nome\s+)?/i, "")
    .replace(/^\s*(?:no|na|em|do|da|para|por|com)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!value || value.split(" ").length > 12 || value.length > 80) return "Transação por voz";
  value = value.replace(/^posto de gasolina\b/i, "Posto de Gasolina");
  value = normalizeProductMeasurements(value);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const INFORMAL_REFERENCE_LABELS: Record<string, string> = {
  mae: "mãe",
  pai: "pai",
  creta: "Creta",
  spacefox: "Spacefox",
  "space fox": "Spacefox",
};

function splitInformalReferenceFromName(name: string): { baseName: string; reference: string | null } {
  if (!name || name === "Transação por voz") return { baseName: name, reference: null };

  const withPreposition = name.match(/\s+(?:do|da|de)\s+(m[aã]e|pai|creta|space\s*fox)\s*$/i);
  const bareKnown = name.match(/\s+(m[aã]e|pai|creta|space\s*fox)\s*$/i);
  const match = withPreposition || bareKnown;
  if (!match) return { baseName: name, reference: null };

  const rawReference = match[1];
  const reference = INFORMAL_REFERENCE_LABELS[normalize(rawReference)];
  if (!reference) return { baseName: name, reference: null };

  const baseName = name.slice(0, match.index).trim().replace(/[,.!?;:]+$/g, "");
  if (!baseName) return { baseName: name, reference: null };
  return { baseName, reference };
}

function findMoneyPosition(text: string): { start: number; end: number } | null {
  const completeMoneyPatterns = [
    VALUE_SPOKEN_DECIMAL_RE,
    VALUE_REALS_AND_CENTS_RE,
    REALS_AND_CENTS_RE,
    SPOKEN_DECIMAL_RE,
    /(?:r\$\s*)(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i,
    /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais?|real)\b/i,
    /\b(?:no\s+valor\s+de|valor\s+de|valor)\s+(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i,
    NUMBER_WORD_MONEY_RE,
    VALUE_WORDS_RE,
  ];

  const complete = completeMoneyPatterns
    .map((pattern) => text.match(pattern))
    .filter((match): match is RegExpMatchArray => !!match && match.index !== undefined)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0];

  if (complete?.index !== undefined) {
    return { start: complete.index, end: complete.index + complete[0].length };
  }

  const conversational = text.match(
    /\b(?:gastei|paguei|comprei|adquiri|recebi|ganhei|lancei|registrei|adicionei)\s+(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\b/i,
  );
  if (!conversational || conversational.index === undefined) return null;

  return {
    start: conversational.index,
    end: conversational.index + conversational[0].length,
  };
}

function extractName(text: string): string {
  const explicit = text.match(new RegExp(
    `\\b(?:nome(?:\\s+da)?(?:\\s+transa[cç][aã]o)?|descri[cç][aã]o)\\s*(?:[,;:=\\-]\\s*)?(?:é|e|vai\\s+ser|ser[aá])?\\s*(?:de\\s+)?(.+?)(?=\\s+(?:${METADATA_BOUNDARY})|[,.]|$)`,
    "i",
  ));
  if (explicit?.[1]) return cleanNameCandidate(explicit[1]);

  // Estrutura natural: "lanço uma despesa, posto de gasolina, referência..., valor..."
  // O trecho entre o tipo da transação e o primeiro metadado é o nome.
  const prefixedName = text.match(new RegExp(
    `\\b(?:lan[cç]o|lance|registr(?:o|e)|adicion(?:o|e)|quero\\s+lan[cç]ar)\\s+(?:uma?\\s+)?(?:despesa|receita|transa[cç][aã]o)\\s*(?:[,;:-]\\s*)?(.+?)(?=\\s*(?:[,;.]\\s*)?(?:refer[eê]ncia\\b|categoria\\b|valor\\b|no\\s+valor\\b|conta\\b|cart[aã]o\\b)|[.!?]|$)`,
    "i",
  ));
  if (prefixedName?.[1]) {
    const cleaned = cleanNameCandidate(prefixedName[1]);
    if (cleaned !== "Transação por voz") return cleaned;
  }

  const naturalPurchaseName = text.match(new RegExp(
    `\\b(?:comprei|adquiri)\\s+(.+?)(?=\\s*(?:[,;.]\\s*)?(?:categoria\\b|valor\\b|no\\s+valor\\b|conta\\b|cart[aã]o\\b|refer[eê]ncia\\b|parcelad[oa]\\b|por\\s+(?:r\\$\\s*)?\\d|em\\s+(?:\\d{1,2}|${NUMBER_WORD_TOKEN})\\s*(?:x|vezes?|parcelas?)\\b)|[!?]|$)`,
    "i",
  ));
  if (naturalPurchaseName?.[1]) {
    const candidate = naturalPurchaseName[1].replace(/^\s*(?:um|uma)\s+/i, "").trim();
    const cleaned = cleanNameCandidate(candidate);
    if (cleaned !== "Transação por voz") return cleaned;
  }

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
      .split(new RegExp(`\\s+(?=(?:(?:na|no|em)\\s+)?(?:${METADATA_BOUNDARY}|${VOICE_FINALIZATION_BOUNDARY})\\b)|[,.]`, "i"))[0]
      ?.trim();
    if (post) {
      const cleaned = cleanNameCandidate(post);
      if (cleaned !== "Transação por voz") return cleaned;
    }
  }

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
  const structured = extractStructuredVoiceFields(transcript);
  const isYield = /\b(rendimentos?|juros?|rentabilidade)\b/.test(normalized);
  const type: VoiceTransactionType = isYield || /\b(recebi|ganhei|entrou|caiu|receita|salario|reembolso)\b/.test(normalized)
    ? "income"
    : "expense";

  const spokenCategoryMatch = transcript.match(new RegExp(
    `\\bcategoria\\s*(?:[,;:=\\-]\\s*)?(?:é|e)?\\s*(.+?)(?=\\s*(?:[,;.]\\s*)?(?:(?:na|no|em)\\s+)?(?:${METADATA_BOUNDARY}|${VOICE_FINALIZATION_BOUNDARY})\\b|[.!?]|$)`,
    "i",
  ));
  const legacySpokenCategory = spokenCategoryMatch?.[1]
    ?.replace(/[,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || null;
  const spokenCategory = structured.category
    ? structured.category.replace(/[,;]+/g, " ").replace(/\s+/g, " ").trim()
    : legacySpokenCategory;
  const structuredName = structured.name ? cleanNameCandidate(structured.name) : null;
  const extractedName = isYield
    ? "Rendimento"
    : structuredName && structuredName !== "Transação por voz"
      ? structuredName
      : extractName(transcript);
  const explicitReference = structured.reference
    ? canonicalizeKnownReference(
        structured.reference
          .replace(/^[()]+|[(),.!?;:]+$/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
    : parseReference(transcript);
  const informalReference = explicitReference
    ? { baseName: extractedName, reference: null }
    : splitInformalReferenceFromName(extractedName);
  const baseName = explicitReference ? extractedName : informalReference.baseName;
  const reference = explicitReference || informalReference.reference;
  const name = reference && !baseName.endsWith(`(${reference})`)
    ? `${baseName} (${reference})`
    : baseName;
  const inferred = isYield
    ? { category: "Receita > Juros", icon: "📈" }
    : inferCategory(name, spokenCategory, type);

  return {
    type,
    name,
    amount: structured.value ? parseAmount(structured.value) : parseAmount(transcript),
    date: structured.date ? parseDate(structured.date, now) : parseDate(transcript, now),
    category: inferred.category,
    categorySource: spokenCategory ? "spoken" : "inferred",
    icon: inferred.icon,
    card: structured.card ? structured.card.replace(/[.!?]+$/, "").trim() : parseCard(transcript),
    bankAccount: structured.bankAccount ? structured.bankAccount.replace(/[.!?]+$/, "").trim() : parseBankAccount(transcript),
    installmentCount: parseInstallments(transcript),
    transcript: transcript.trim(),
  };
}
