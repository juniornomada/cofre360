import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isPotentialSubcategoryReport, parseSubcategoryReport } from "@/lib/insights-subcategory-report";

const actualExample = [
  "### 🚗 Transporte por subcategoria — Setembro/2026 × Outubro/2026",
  "",
  "**Compras identificadas na categoria:**",
  "- Setembro/2026: **R$ 1.557,96**",
  "- Outubro/2026: **R$ 3.382,04**",
  "",
  "#### Comparativo das subcategorias",
  "- **Manutenção** — Setembro/2026: R$ 80,00 → Outubro/2026: R$ 2.250,00 (**+R$ 2.170,00**)",
  "- **Combustível** — Setembro/2026: R$ 1.085,85 → Outubro/2026: R$ 796,12 (**-R$ 289,73**)",
  "- **Pedágio** — Setembro/2026: R$ 167,06 → Outubro/2026: R$ 297,02 (**+R$ 129,96**)",
  "- **Outros** — Setembro/2026: R$ 168,50 → Outubro/2026: R$ 38,90 (**-R$ 129,60**)",
  "- **Uber/99** — Setembro/2026: R$ 56,55 → Outubro/2026: R$ 0,00 (**-R$ 56,55**)",
  "",
  "#### Principais compras — Setembro/2026",
  "- **Combustível** · Posto de Gasolina (Spacefox) — R$ 212,00",
  "- **Combustível** · Posto de Gasolina (Creta) — R$ 169,36",
  "- **Outros** · Guincho Rafael — R$ 150,00",
  "- **Combustível** · Posto de Gasolina (Creta) — R$ 147,38",
  "- **Combustível** · Posto de Gasolina (Creta) — R$ 146,28",
  "- **Combustível** · Posto de Gasolina (Creta) — R$ 118,37",
  "_Exibindo as 6 maiores de 17 compras em Setembro/2026._",
  "",
  "#### Principais compras — Outubro/2026",
  "- **Manutenção** · Speedkey (Wander) — R$ 1.310,00",
  "- **Manutenção** · Dy Faroll (Spacefox) — R$ 840,00",
  "- **Pedágio** · Conectcar — R$ 204,42",
  "- **Combustível** · Posto de Gasolina (Creta) — R$ 180,02",
  "- **Combustível** · Posto de Gasolina (Creta) — R$ 172,31",
  "- **Combustível** · Posto de Gasolina (Spacefox) — R$ 171,01",
  "_Exibindo as 6 maiores de 11 compras em Outubro/2026._",
  "",
  "> 💡 Compras parceladas entram pelo valor integral no mês original; os pagamentos posteriores não são somados novamente por categoria.",
].join("\n");

describe("Insights — painel compacto de subcategorias", () => {
  it("entende a resposta real salva no histórico e confere os totais em centavos", () => {
    const report = parseSubcategoryReport(actualExample);
    expect(report).not.toBeNull();
    expect(report).toMatchObject({
      category: "Transporte",
      earlierLabel: "Setembro/2026",
      laterLabel: "Outubro/2026",
      earlierCents: 155796,
      laterCents: 338204,
      differenceCents: 182408,
      reconciled: true,
    });
    expect(report!.subcategories).toHaveLength(5);
    expect(report!.subcategories.find((x) => x.name === "Manutenção"))
      .toMatchObject({ beforeCents: 8000, afterCents: 225000, differenceCents: 217000 });
    expect(report!.subcategories.find((x) => x.name === "Combustível"))
      .toMatchObject({ beforeCents: 108585, afterCents: 79612, differenceCents: -28973 });
    expect(report!.earlierPurchases).toMatchObject({ totalCount: 17 });
    expect(report!.laterPurchases).toMatchObject({ totalCount: 11 });
    expect(report!.earlierPurchases.items).toHaveLength(6);
    expect(report!.laterPurchases.items[0]).toMatchObject({
      subcategory: "Manutenção", name: "Speedkey (Wander)", amountCents: 131000,
    });
  });

  it("não finge reconciliar se os totais ou diferenças são inconsistentes", () => {
    expect(parseSubcategoryReport(actualExample.replace("R$ 3.382,04**", "R$ 3.382,05**"))?.reconciled).toBe(false);
    expect(parseSubcategoryReport(actualExample.replace("(**+R$ 2.170,00**)", "(**+R$ 2.170,01**)"))?.reconciled).toBe(false);
    expect(parseSubcategoryReport(actualExample.replace("(**+R$ 2.170,00**)", "(**+R$ 2.170,00**)"))?.reconciled).toBe(true);
  });

  it("não confunde um relatório simples de um mês com um comparativo", () => {
    const oldAnswer = "### 🍴 Alimentação por subcategoria — Setembro/2026\n\n**Total: R$ 1.045,34**";
    expect(isPotentialSubcategoryReport(oldAnswer)).toBe(false);
    expect(parseSubcategoryReport(oldAnswer)).toBeNull();
    expect(parseSubcategoryReport("")).toBeNull();
  });

  it("se adapta a outros períodos e categorias, inclusive valor zero", () => {
    const newAnswer = actualExample.replaceAll("Transporte", "Alimentação")
      .replaceAll("Setembro/2026", "Janeiro/2025")
      .replaceAll("Outubro/2026", "Fevereiro/2025");
    expect(parseSubcategoryReport(newAnswer)).toMatchObject({
      category: "Alimentação", earlierLabel: "Janeiro/2025", laterLabel: "Fevereiro/2025",
      reconciled: true,
    });
    const zeroAnswer = actualExample.replace("R$ 1.085,85 →", "R$ 0,00 →");
    expect(parseSubcategoryReport(zeroAnswer)?.reconciled).toBe(false);
  });

  it("não interpreta texto arbitrário ou dados malformados como relatório financeiro válido", () => {
    expect(parseSubcategoryReport(actualExample.replace("#### Comparativo das subcategorias", "#### Outra seção"))).toBeNull();
    expect(parseSubcategoryReport(actualExample.replace("Outubro/2026: R$ 2.250,00", "Novembro/2026: R$ 2.250,00"))).toBeNull();
    expect(parseSubcategoryReport(actualExample.replace("R$ 1.557,96**", "R$ desconhecido**"))).toBeNull();
  });
});

describe("Insights — apresentação responsiva", () => {
  const frontend = readFileSync(resolve(process.cwd(), "src/components/FinancialChat.tsx"), "utf8");
  const component = readFileSync(resolve(process.cwd(), "src/components/SubcategoryInsightCard.tsx"), "utf8");
  it("reutiliza mensagens existentes, com layout que ocupa a largura do celular", () => {
    expect(frontend).toContain("parseSubcategoryReport(msg.content)");
    expect(frontend).toContain("<SubcategoryInsightCard report={subcategoryReport} />");
    expect(frontend).toContain("w-full max-w-full self-start");
  });
  it("organiza compras em áreas expansíveis acessíveis, sem truncar os nomes", () => {
    expect(component).toContain("<details ");
    expect(component).toContain("<summary ");
    expect(component).toContain("break-words font-medium");
    expect(component).toContain("Lista parcial: mostra apenas as maiores compras.");
    expect(component).not.toContain("truncate");
  });
  it("destaca variação e confere fechamento dos subtotais", () => {
    expect(component).toContain("Maior aumento:");
    expect(component).toContain("report.reconciled");
    expect(component).toContain("report.subcategories.map");
    expect(component).toContain("percentChange");
  });
});
