/** Actionable category drill-downs, grounded in the deterministic comparison text.
 * Never guess a period: use the exact months shown in that assistant answer.
 */
export type ChatLine = { role: "user" | "assistant"; content: string };
export type CategoryQuickAction = { category: string; prompt: string };
export type CategoryDrilldowns = {
  earlier: string;
  later: string;
  actions: CategoryQuickAction[];
};

const MONTH_PATTERN = "(?:Janeiro|Fevereiro|Março|Marco|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\\/\\d{4}";
const HEADING = new RegExp(
  `^###\\s+.*?Comparativo por categoria\\s+[—–-]\\s+(${MONTH_PATTERN})\\s*[×x]\\s*(${MONTH_PATTERN})\\s*$`,
  "im",
);
const CATEGORY_ROW = /^-\s+\S+\s+\*\*([^*\n]{2,60})\*\*\s+[—–-]\s+/gm;

function parseComparison(content: string): CategoryDrilldowns | null {
  const heading = content.match(HEADING);
  if (!heading) return null;
  const earlier = heading[1];
  const later = heading[2];
  const actions: CategoryQuickAction[] = [];
  const seen = new Set<string>();
  for (const row of content.matchAll(CATEGORY_ROW)) {
    const category = row[1].trim();
    if (!/^[\p{L}\s/&-]{2,60}$/u.test(category) || seen.has(category.toLowerCase())) continue;
    seen.add(category.toLowerCase());
    actions.push({
      category,
      prompt: `Detalhe as subcategorias de ${category} entre ${earlier} e ${later}, comparando os valores e mostrando os principais lançamentos.`,
    });
  }
  return actions.length ? { earlier, later, actions: actions.slice(0, 12) } : null;
}

function isDrilldownPrompt(content: string, view: CategoryDrilldowns): boolean {
  return view.actions.some((action) => content === action.prompt);
}

export function extractCategoryDrilldowns(messages: readonly ChatLine[]): CategoryDrilldowns | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "assistant") continue;
    const view = parseComparison(messages[i].content);
    if (!view) continue;
    // An unrelated new question invalidates the contextual actions.
    // Drill-downs from the same comparison keep the choices available.
    const laterQuestions = messages.slice(i + 1).filter((m) => m.role === "user");
    if (laterQuestions.some((m) => !isDrilldownPrompt(m.content, view))) return null;
    return view;
  }
  return null;
}
