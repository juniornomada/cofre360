import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const investSrc = readFileSync(resolve(process.cwd(), "src/routes/invest.tsx"), "utf8");
const migrationSrc = readFileSync(resolve(process.cwd(), "supabase/migrations/20261016090000_investment_custom_color.sql"), "utf8");

describe("Investment color flow", () => {
  it("loads saved color when editing and writes validated color when saving", () => {
    expect(investSrc).toContain("color: normalizeInvestmentColor(inv.color)");
    expect(investSrc).toContain("color: normalizeInvestmentColor(form.color)");
    expect(investSrc).toContain(".update(payload)");
    expect(investSrc).toContain(".insert([{ ...payload, user_id: user.id }])");
  });

  it("offers a color-only update that never sends investment amounts", () => {
    expect(investSrc).toContain("Salvar somente a cor");
    expect(investSrc).toContain("onClick={handleSaveColorOnly}");
    const start = investSrc.indexOf("const handleSaveColorOnly = async");
    const end = investSrc.indexOf("const handleDelete = async", start);
    const block = investSrc.slice(start, end);
    expect(block).toContain(".update({ color: normalizeInvestmentColor(form.color) })");
    expect(block).not.toContain("payload");
    expect(block).not.toContain("derivedInvested");
    expect(block).not.toContain("current_gross_value");
    expect(block).toContain('toast.success("Cor do investimento atualizada")');
  });

  it("supports palette, custom colors and restoring the automatic category color", () => {
    expect(investSrc).toContain('aria-label="Cores do investimento"');
    expect(investSrc).toContain('aria-label="Cor automática da classe"');
    expect(investSrc).toContain("INVESTMENT_COLOR_OPTIONS.map");
    expect(investSrc).toContain('type="color"');
    expect(investSrc).toContain("color: null");
  });

  it("uses personalized colors in investment cards but class colors in the allocation chart", () => {
    expect(investSrc).not.toContain("borderLeftColor: getInvestmentColor(inv.color, inv.asset_class)");
    expect(investSrc).not.toContain("border-l-4");
    expect(investSrc).toContain("backgroundColor: investmentColor");
    expect(investSrc).toContain("<InvestmentIcon assetClass={inv.asset_class} color={investmentColor} />");
    expect(investSrc).toContain("color: getAssetClassColor(key)");
  });

  it("moves deletion into edit mode and requires named confirmation", () => {
    expect(investSrc).not.toContain('aria-label={`Excluir ${inv.name}`}');
    expect(investSrc).toContain('onClick={() => openEdit(inv)}');
    expect(investSrc).toContain("onClick={requestDelete}>Excluir");
    expect(investSrc).toContain("setDeleteId(editing.id)");
    expect(investSrc).toContain('editing?.name || "este investimento"');
    expect(investSrc).toContain("onClick={cancelDelete} disabled={deleting}");
    expect(investSrc).toContain("onClick={handleDelete} disabled={deleting}");
  });

  it("renders class icons in the selected investment color", () => {
    expect(investSrc).toContain("const INVESTMENT_ICONS: Record<AssetClass, LucideIcon>");
    expect(investSrc).toContain('className="h-5 w-5" style={{ color }}');
    expect(investSrc).toContain("const investmentColor = getInvestmentColor(inv.color, inv.asset_class)");
  });

  it("adds a nullable validated column without weakening RLS or rewriting existing data", () => {
    expect(migrationSrc).toContain("ALTER TABLE public.investments");
    expect(migrationSrc).toContain("ADD COLUMN IF NOT EXISTS color text");
    expect(migrationSrc).toContain("color IS NULL");
    expect(migrationSrc).toContain("investments_color_hex_check");
    expect(migrationSrc).not.toMatch(/UPDATE\s+public\.investments/i);
    expect(migrationSrc).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });
});
