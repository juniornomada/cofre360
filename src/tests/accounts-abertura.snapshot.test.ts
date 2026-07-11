import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Snapshot tests para a linha de "Abertura" em /accounts.
 *
 * Regressões cobertas:
 *  - O rótulo "Abertura:" só aparece quando `openingBalance !== 0`.
 *  - Quando não há movimentações e a abertura é o único componente do
 *    saldo (`openingIsOnlyComponent`), o texto vira `font-semibold
 *    text-primary` e um selo/badge "único componente" é renderizado
 *    ao lado, com `bg-primary/10 text-primary` e `aria-label` descritivo.
 *  - Sem esse destaque, a linha permanece em `text-muted-foreground`.
 *
 * Estratégia (idêntica à `home-cards-header.snapshot.test.ts`):
 *  Lê o fonte de `src/routes/accounts.tsx` e extrai o bloco JSX exato
 *  do trecho da Abertura. O snapshot inline congela a marcação; qualquer
 *  alteração acidental (cor, tipografia, aria-label, condição de exibição)
 *  força um diff explícito.
 */

const source = readFileSync(
  resolve(__dirname, "../routes/accounts.tsx"),
  "utf8",
);

/** Extrai o bloco JSX condicional que renderiza a linha "Abertura". */
function extractAberturaBlock(src: string): string {
  const start = src.indexOf("{openingBalance !== 0 && (");
  if (start === -1) throw new Error("bloco de Abertura não encontrado");
  // Encontra o fechamento correspondente balanceando parênteses/chaves
  // a partir do `{`.
  let depthBrace = 0;
  let depthParen = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depthBrace++;
    else if (ch === "}") {
      depthBrace--;
      if (depthBrace === 0 && depthParen === 0) {
        return src.slice(start, i + 1);
      }
    } else if (ch === "(") depthParen++;
    else if (ch === ")") depthParen--;
  }
  throw new Error("fim do bloco de Abertura não encontrado");
}

describe("Accounts · linha de Abertura", () => {
  const block = extractAberturaBlock(source);

  it("só renderiza a linha quando openingBalance !== 0", () => {
    // Guarda contra o cenário em que alguém remove a condição e passa
    // a exibir "Abertura: R$ 0,00" para toda conta zerada.
    expect(block.startsWith("{openingBalance !== 0 && (")).toBe(true);
  });

  it("alterna a tipografia entre destaque (primary) e neutro (muted-foreground)", () => {
    expect(block).toMatch(
      /openingIsOnlyComponent[\s\S]*\?\s*"font-semibold text-primary"[\s\S]*:\s*"text-muted-foreground"/,
    );
  });

  it("aplica title acessível ao valor da abertura", () => {
    expect(block).toMatch(/title="Saldo de abertura da conta"/);
  });

  it("renderiza o selo 'único componente' com destaque quando openingIsOnlyComponent", () => {
    expect(block).toMatch(/\{openingIsOnlyComponent && \(/);
    // Contraste AA: usa tokens sólidos primary + primary-foreground (não a
    // versão tingida `bg-primary/10` que reduzia o contraste em <9px).
    expect(block).toMatch(/bg-primary text-primary-foreground/);
    expect(block).not.toMatch(/bg-primary\/10/);
    expect(block).toMatch(/border border-primary/);
    // Acessibilidade: role="status" + aria-label descritivo com o valor
    // real da abertura e o nome da conta.
    expect(block).toMatch(/role="status"/);
    expect(block).toMatch(
      /aria-label=\{`Sem movimentações no período[\s\S]*saldo de abertura da conta \$\{account\.name\}`\}/,
    );
    // Texto visível marcado como aria-hidden para evitar leitura duplicada
    // pelo leitor de tela (o aria-label já descreve o selo).
    expect(block).toMatch(/<span aria-hidden="true">único componente<\/span>/);
    expect(block).toMatch(/rounded-full/);
    expect(block).toMatch(/uppercase/);
    expect(block).toMatch(/font-semibold/);
  });

  it("mascara o valor quando balanceVisible = false", () => {
    expect(block).toMatch(/balanceVisible[\s\S]*R\$ ••••/);
    // Usa o formatador centralizado com sinal explícito para débito/crédito.
    expect(block).toMatch(/formatSignedBRL\(openingBalance\)/);
  });

  it("aplica cor destrutiva quando a abertura é negativa e não é o único componente", () => {
    expect(block).toMatch(
      /openingBalance < 0 && !openingIsOnlyComponent[\s\S]*\?\s*"text-destructive"/,
    );
  });

  it("mantém responsividade em telas pequenas (wrap + shrink-0 + truncate)", () => {
    // Container permite quebra em duas linhas em telas estreitas sem
    // achatar o selo.
    expect(block).toMatch(/flex flex-wrap items-center gap-x-1\.5 gap-y-0\.5 min-w-0/);
    // Texto da abertura pode encolher e truncar.
    expect(block).toMatch(/text-\[11px\] tabular-nums leading-tight min-w-0 truncate/);
    // Selo nunca encolhe nem quebra internamente e escala tipografia no sm.
    expect(block).toMatch(/shrink-0 whitespace-nowrap text-\[10px\] sm:text-\[11px\]/);
    // O tamanho anterior de 9px (abaixo do mínimo recomendado) foi removido.
    expect(block).not.toMatch(/text-\[9px\]/);
  });

  it("congela a marcação completa do bloco de Abertura (snapshot inline)", () => {
    expect(block).toMatchInlineSnapshot(`
      "{openingBalance !== 0 && (
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
                          <span
                            className={cn(
                              "text-[11px] tabular-nums leading-tight min-w-0 truncate",
                              openingIsOnlyComponent
                                ? "font-semibold text-primary"
                                : "text-muted-foreground",
                              openingBalance < 0 && !openingIsOnlyComponent
                                ? "text-destructive"
                                : "",
                            )}
                            title="Saldo de abertura da conta"
                          >
                            Abertura: {balanceVisible
                              ? formatSignedBRL(openingBalance)
                              : "R$ ••••"}
                          </span>
                          {openingIsOnlyComponent && (
                            <span
                              role="status"
                              aria-label={\`Sem movimentações no período — o saldo atual (\${
                                balanceVisible ? formatSignedBRL(openingBalance) : "oculto"
                              }) é composto exclusivamente pelo saldo de abertura da conta \${account.name}\`}
                              title="Saldo atual é apenas a abertura (sem movimentações no período)"
                              className="shrink-0 whitespace-nowrap text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground border border-primary"
                            >
                              <span aria-hidden="true">único componente</span>
                            </span>
                          )}
                        </div>
                      )}"
    `);
  });
});

describe("Accounts · derivação de openingIsOnlyComponent", () => {
  it("está definido como !hasMovements && openingBalance !== 0", () => {
    // Assegura que a regra de negócio que dispara o destaque não muda
    // silenciosamente (ex.: alguém trocando `!hasMovements` por
    // `hasMovements` ou removendo a checagem de openingBalance).
    expect(source).toMatch(
      /const openingIsOnlyComponent = !hasMovements && openingBalance !== 0;/,
    );
    expect(source).toMatch(
      /const hasMovements = income !== 0 \|\| expense !== 0;/,
    );
  });
});
