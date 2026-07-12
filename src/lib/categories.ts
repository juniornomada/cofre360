export type Subcategory = {
  label: string;
  icon: string;
};

export type CategoryGroup = {
  label: string;
  icon: string;
  type: "expense" | "income";
  subcategories: Subcategory[];
};

export const categoryTree: CategoryGroup[] = [
  {
    label: "Alimentação",
    icon: "🍔",
    type: "expense",
    subcategories: [
      { label: "Supermercado", icon: "🛒" },
      { label: "Restaurante", icon: "🍽️" },
      { label: "Delivery", icon: "🛵" },
      { label: "Padaria/Café", icon: "☕" },
      { label: "Açougue/Hortifruti", icon: "🥩" },
      { label: "Outros", icon: "🍔" },
    ],
  },
  {
    label: "Transporte",
    icon: "🚗",
    type: "expense",
    subcategories: [
      { label: "Uber/99", icon: "🚕" },
      { label: "Ônibus/Metrô", icon: "🚌" },
      { label: "Combustível", icon: "⛽" },
      { label: "Estacionamento", icon: "🅿️" },
      { label: "Manutenção", icon: "🔧" },
      { label: "Documentação", icon: "📋" },
      { label: "Pedágio", icon: "🛣️" },
      { label: "Outros", icon: "🚗" },
    ],
  },
  {
    label: "Moradia",
    icon: "🏠",
    type: "expense",
    subcategories: [
      { label: "Aluguel", icon: "🏠" },
      { label: "Condomínio", icon: "🏢" },
      { label: "Energia", icon: "⚡" },
      { label: "Água", icon: "💧" },
      { label: "Gás", icon: "🔥" },
      { label: "Internet/Telefone", icon: "📶" },
      { label: "IPTU", icon: "🏛️" },
      { label: "Seguro Residencial", icon: "🛡️" },
      { label: "Outros", icon: "🏠" },
    ],
  },
  {
    label: "Saúde",
    icon: "💊",
    type: "expense",
    subcategories: [
      { label: "Farmácia", icon: "💊" },
      { label: "Consulta Médica", icon: "🩺" },
      { label: "Dentista", icon: "🦷" },
      { label: "Exames", icon: "🔬" },
      { label: "Plano de Saúde", icon: "🏥" },
      { label: "Ótica", icon: "👓" },
      { label: "Outros", icon: "💊" },
    ],
  },
  {
    label: "Educação",
    icon: "📚",
    type: "expense",
    subcategories: [
      { label: "Mensalidade", icon: "🎓" },
      { label: "Cursos Online", icon: "💻" },
      { label: "Livros", icon: "📖" },
      { label: "Material Escolar", icon: "✏️" },
      { label: "Outros", icon: "📚" },
    ],
  },
  {
    label: "Lazer",
    icon: "🎮",
    type: "expense",
    subcategories: [
      { label: "Cinema/Teatro", icon: "🎬" },
      { label: "Viagem", icon: "✈️" },
      { label: "Jogos", icon: "🎮" },
      { label: "Parques/Eventos", icon: "🎡" },
      { label: "Outros", icon: "🎮" },
    ],
  },
  {
    label: "Compras",
    icon: "🛍️",
    type: "expense",
    subcategories: [
      { label: "Roupas/Calçados", icon: "👕" },
      { label: "Eletrônicos", icon: "📱" },
      { label: "Compras Online", icon: "🛒" },
      { label: "Casa/Decoração", icon: "🛋️" },
      { label: "Outros", icon: "🛍️" },
    ],
  },
  {
    label: "Assinaturas",
    icon: "📱",
    type: "expense",
    subcategories: [
      { label: "Streaming", icon: "📺" },
      { label: "Apps/Serviços", icon: "📱" },
      { label: "Outros", icon: "📱" },
    ],
  },
  {
    label: "Serviços",
    icon: "🔧",
    type: "expense",
    subcategories: [
      { label: "Limpeza", icon: "🧹" },
      { label: "Manutenção", icon: "🔧" },
      { label: "Profissionais", icon: "👷" },
      { label: "Outros", icon: "🔧" },
    ],
  },
  {
    label: "Pets",
    icon: "🐾",
    type: "expense",
    subcategories: [
      { label: "Ração/Petiscos", icon: "🦴" },
      { label: "Veterinário", icon: "🏥" },
      { label: "Petshop", icon: "🐾" },
      { label: "Outros", icon: "🐾" },
    ],
  },
  {
    label: "Impostos/Taxas",
    icon: "🏛️",
    type: "expense",
    subcategories: [
      { label: "IR", icon: "📊" },
      { label: "INSS/FGTS", icon: "🏛️" },
      { label: "Taxas Bancárias", icon: "🏦" },
      { label: "Multas", icon: "⚠️" },
      { label: "Outros", icon: "🏛️" },
    ],
  },
  {
    label: "Dívidas/Parcelas",
    icon: "📋",
    type: "expense",
    subcategories: [
      { label: "Financiamento", icon: "🏦" },
      { label: "Empréstimo", icon: "💸" },
      { label: "Consórcio", icon: "📋" },
      { label: "Outros", icon: "📋" },
    ],
  },
  {
    label: "Transferências",
    icon: "🔄",
    type: "expense",
    subcategories: [
      { label: "PIX", icon: "⚡" },
      { label: "TED/DOC", icon: "🔄" },
      { label: "Outros", icon: "🔄" },
    ],
  },
  {
    label: "Receita",
    icon: "💰",
    type: "income",
    subcategories: [
      { label: "Salário", icon: "💼" },
      { label: "Freelance", icon: "💻" },
      { label: "Juros", icon: "📈" },
      { label: "Reembolso", icon: "↩️" },
      { label: "Outros", icon: "💰" },
    ],
  },
  {
    label: "Pagamento de Cartão",
    icon: "💳",
    type: "expense",
    subcategories: [
      { label: "Pagamento Total", icon: "💳" },
      { label: "Pagamento Parcial", icon: "💳" },
      { label: "Outros", icon: "💳" },
    ],
  },
  {
    label: "Outros",
    icon: "📄",
    type: "expense",
    subcategories: [
      { label: "Outros", icon: "📄" },
    ],
  },
];


/** Flat list of "Categoria > Subcategoria" values for storage */
export function getCategoryValue(group: string, sub: string): string {
  return `${group} > ${sub}`;
}

/** Parse a stored value back into group + sub */
export function parseCategoryValue(value: string): { group: string; sub: string } {
  const parts = value.split(" > ");
  if (parts.length === 2) return { group: parts[0], sub: parts[1] };
  
  // Normalize singular/plural transfers
  if (value === "Transferência" || value === "Transferências") {
    return { group: "Transferências", sub: "Outros" };
  }

  // Legacy: try to match old flat category to a group
  const found = categoryTree.find(g => g.label === value);
  if (found) return { group: found.label, sub: "Outros" };
  return { group: "Outros", sub: "Outros" };
}

/** Get the display label (short) */
export function getCategoryDisplay(value: string): string {
  const { group, sub } = parseCategoryValue(value);
  if (sub === "Outros") return group;
  return sub;
}

/**
 * Normaliza um rótulo para comparação tolerante:
 *  - remove diacríticos (á → a)
 *  - converte para minúsculas
 *  - colapsa qualquer whitespace (incl. NBSP, tabs, quebras) em um único espaço
 *  - trim
 * Usado apenas em comparação — não altera valores armazenados.
 */
function normalizeCategoryLabel(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\u00A0]+/g, " ")
    .trim()
    .toLowerCase();
}

/** Get the icon for a stored category value */
export function getCategoryIcon(value: string): string {
  if (typeof value !== "string" || !value) return "📄";

  // Divisão tolerante — aceita separador com whitespace irregular ou ausente
  // ao redor de ">" ("A > B", "A>B", "A  >\tB", etc.). Se não houver ">",
  // trata o valor inteiro como grupo.
  const rawParts = value.split(/\s*>\s*/);
  const rawGroup = rawParts[0] ?? "";
  const rawSub = rawParts.length > 1 ? rawParts.slice(1).join(" > ") : "";
  const nGroup = normalizeCategoryLabel(rawGroup);
  const nSub = rawSub ? normalizeCategoryLabel(rawSub) : "";

  // 1) Match exato (caminho canônico rápido).
  let g = categoryTree.find(c => c.label === rawGroup);
  if (!g) {
    // 2) Match tolerante (case/acentos/whitespace).
    g = categoryTree.find(c => normalizeCategoryLabel(c.label) === nGroup);
  }
  if (!g) return "📄";

  if (!rawSub) return g.icon;

  let s = g.subcategories.find(sc => sc.label === rawSub);
  if (!s) {
    s = g.subcategories.find(sc => normalizeCategoryLabel(sc.label) === nSub);
  }
  return s?.icon || g.icon;
}

/** Flat list of all main category labels (for filter chips) */
export const mainCategories = categoryTree.map(g => g.label);

/** Flat list of all possible stored values (for backward compat) */
export function getAllCategoryValues(): string[] {
  const values: string[] = [];
  for (const g of categoryTree) {
    for (const s of g.subcategories) {
      values.push(getCategoryValue(g.label, s.label));
    }
  }
  return values;
}
