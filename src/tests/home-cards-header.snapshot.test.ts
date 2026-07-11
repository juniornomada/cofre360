import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Snapshot tests for the CARTÕES header on the Home page.
 *
 * Guards:
 *  - The "Gerenciar" link must NOT exist anymore (removed alongside the
 *    inline month navigator refactor).
 *  - The month selector must remain aligned to the right of the CARTÕES
 *    heading through a single `justify-between` flex container.
 */

const source = readFileSync(
  resolve(__dirname, "../routes/index.tsx"),
  "utf8"
);

// Extract the CARTÕES section header (from the section opening comment up to
// the first `</div>` that closes the header row).
function extractCardsHeader(src: string): string {
  const start = src.indexOf("{/* Credit Cards Summary */}");
  if (start === -1) throw new Error("CARTÕES section marker not found");
  const endMarker = "{allCards.length === 0";
  const endIdx = src.indexOf(endMarker, start);
  if (endIdx === -1) throw new Error("CARTÕES header end not found");
  return src.slice(start, endIdx).trimEnd();
}

describe("Home · CARTÕES header", () => {
  it("does not render a 'Gerenciar' link", () => {
    const header = extractCardsHeader(source);
    expect(header).not.toMatch(/Gerenciar/);
    // Also assert globally in the section that no lingering link points to
    // `/cards` labelled "Gerenciar".
    expect(source).not.toMatch(/>\s*Gerenciar\s*</);
  });

  it("aligns the month selector on the right of the CARTÕES title", () => {
    const header = extractCardsHeader(source);
    // Single justify-between row with title on the left and the month
    // navigator wrapper on the right.
    expect(header).toMatch(
      /flex items-center justify-between[^"]*"[\s\S]*CART[ÕO]ES[\s\S]*ChevronLeft[\s\S]*ChevronRight/
    );
    // Prev / next controls sit in the same inline flex group.
    expect(header).toMatch(/flex items-center gap-0\.5/);
    // ARIA labels for the navigator remain intact.
    expect(header).toMatch(/aria-label="Fatura do mês anterior"/);
    expect(header).toMatch(/aria-label="Fatura do próximo mês"/);
  });

  it("matches the CARTÕES header snapshot", () => {
    const header = extractCardsHeader(source);
    expect(header).toMatchInlineSnapshot(`
      "{/* Credit Cards Summary */}
            <div className=\\"rounded-2xl bg-gradient-to-br from-primary/15 via-card to-card p-4 border border-border/40\\">
              <div className=\\"flex items-center justify-between gap-4 mb-2\\">
                <h2 className=\\"text-sm font-semibold text-foreground flex items-center gap-1.5 uppercase\\">
                  <CreditCard className=\\"h-4 w-4 text-primary\\" />
                  CARTÕES
                </h2>

                <div className=\\"flex items-center gap-2\\">
                  {(() => {
                    const today = new Date();
                    const ref = new Date(today.getFullYear(), today.getMonth() + homeMonthOffset, 15);
                    const label = monthNames[ref.getMonth()];
                    const yearLabel = ref.getFullYear() !== today.getFullYear() ? \` \${ref.getFullYear()}\` : \\"\\";
                    return (
                      <div className=\\"flex items-center gap-0.5\\">
                        <button
                          type=\\"button\\"
                          onClick={() => setHomeMonthOffset(homeMonthOffset - 1)}
                          className=\\"h-6 w-6 rounded-md hover:bg-primary/10 text-primary flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50\\"
                          aria-label=\\"Fatura do mês anterior\\"
                          title=\\"Mês anterior\\"
                        >
                          <ChevronLeft className=\\"h-3.5 w-3.5\\" />
                        </button>
                        <span className=\\"text-[11px] font-semibold text-foreground capitalize tabular-nums min-w-[64px] text-center\\">
                          {label}{yearLabel}
                        </span>
                        <button
                          type=\\"button\\"
                          onClick={() => setHomeMonthOffset(homeMonthOffset + 1)}
                          className=\\"h-6 w-6 rounded-md hover:bg-primary/10 text-primary flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50\\"
                          aria-label=\\"Fatura do próximo mês\\"
                          title=\\"Próximo mês\\"
                        >
                          <ChevronRight className=\\"h-3.5 w-3.5\\" />
                        </button>
                        {homeMonthOffset !== 0 && (
                          <button
                            type=\\"button\\"
                            onClick={() => setHomeMonthOffset(0)}
                            className=\\"text-[10px] font-semibold text-primary hover:underline underline-offset-2 ml-1\\"
                            aria-label=\\"Voltar para a fatura atual\\"
                          >
                            hoje
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>"
    `);
  });
});
