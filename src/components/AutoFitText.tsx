import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * AutoFitText
 * ----------------------------------------------------------------
 * Renderiza texto em uma ou mais linhas e, se ele não couber no
 * container disponível, reduz proporcionalmente o `font-size` até
 * caber (ou até atingir o piso legível `minFontSizePx`). Se mesmo no
 * piso continuar transbordando, cai para `text-overflow: ellipsis`
 * (ou line-clamp quando `maxLines > 1`), garantindo que o layout
 * nunca quebre.
 *
 * Legibilidade
 *  - Piso legível padrão: **11px** — suficiente para leitura em
 *    densidades ≥1x em dispositivos mobile modernos. Não vá abaixo de
 *    9px sem uma boa razão (chips, badges numéricos).
 *  - Recomendações por contexto (defina explicitamente via prop):
 *      • Corpo/listas       → `minFontSizePx={11}` (default)
 *      • Títulos/cards      → `minFontSizePx={12}`
 *      • Chips/badges       → `minFontSizePx={9}`
 *      • Micro-metadados    → `minFontSizePx={8}` (só quando cercado
 *                             por contexto e não for CTA/estado)
 *
 * Como funciona
 *  - Modo single-line (`maxLines=1`, padrão): mede `scrollWidth` do
 *    span contra `clientWidth` do pai (`flex-1 min-w-0`) e reduz o
 *    font-size até caber; fallback com `text-ellipsis`.
 *  - Modo multi-line (`maxLines>1`): usa `-webkit-line-clamp` para
 *    limitar visualmente e mede `scrollHeight` contra `maxLines *
 *    lineHeight` para decidir se precisa encolher; fallback com
 *    line-clamp visual + `title` completo.
 *  - Ajusta `fontSize` em pixels; a fonte base é lida do computed
 *    style na 1ª medição, então respeita classes Tailwind aplicadas
 *    no próprio nó (`text-xs`, `text-[10px]`…).
 *  - Loop de fit em um único `requestAnimationFrame`. Reset ao valor
 *    base antes de cada medição — evita ficar preso no piso.
 *
 * Acessibilidade
 *  - Mantém o texto completo no DOM (não trunca em JS) — leitores de
 *    tela recebem o conteúdo inteiro.
 *  - Se ficar com ellipsis/line-clamp (piso atingido), expõe o texto
 *    original via `title` para tooltip nativo.
 */

/** Piso legível padrão (px). Escolhido para densidade 1x em mobile. */
export const AUTO_FIT_DEFAULT_MIN_FONT_SIZE_PX = 11;
/** Piso técnico absoluto — abaixo disso o navegador colapsa métricas. */
export const AUTO_FIT_ABSOLUTE_MIN_FONT_SIZE_PX = 6;

export interface AutoFitTextProps {
  /** Conteúdo textual. Nós filhos não-textuais não são medidos com precisão — prefira strings. */
  children: React.ReactNode;
  /** Classe aplicada ao <span> raiz (tipografia, cor, peso). */
  className?: string;
  /**
   * Piso do font-size em px. Default {@link AUTO_FIT_DEFAULT_MIN_FONT_SIZE_PX}.
   * Valores abaixo de {@link AUTO_FIT_ABSOLUTE_MIN_FONT_SIZE_PX} são
   * automaticamente elevados a esse piso técnico.
   */
  minFontSizePx?: number;
  /**
   * Passo de decremento em px. Default 0.5.
   * Menor = mais suave, custa mais medições — o ganho perceptual
   * abaixo de 0.5px é desprezível.
   */
  stepPx?: number;
  /**
   * Quantidade máxima de linhas antes de aplicar ellipsis / line-clamp.
   * Default 1 (single-line, comportamento original). Aceita inteiros ≥1.
   */
  maxLines?: number;
  /** Texto usado no `title` de fallback (default: string filho quando aplicável). */
  titleFallback?: string;
}

function extractText(node: React.ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  // Elementos React: melhor esforço via props.children (não medimos JSX aninhado).
  const asAny = node as { props?: { children?: React.ReactNode } };
  return asAny?.props?.children ? extractText(asAny.props.children) : "";
}

export function AutoFitText({
  children,
  className,
  minFontSizePx = AUTO_FIT_DEFAULT_MIN_FONT_SIZE_PX,
  stepPx = 0.5,
  maxLines = 1,
  titleFallback,
}: AutoFitTextProps) {
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const baseFontSizeRef = useRef<number | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  // Sanitiza props numéricas para evitar loops infinitos ou fontes ilegíveis.
  const safeMaxLines = Math.max(1, Math.floor(Number.isFinite(maxLines) ? maxLines : 1));
  const safeMinFont = Math.max(
    AUTO_FIT_ABSOLUTE_MIN_FONT_SIZE_PX,
    Number.isFinite(minFontSizePx) ? minFontSizePx : AUTO_FIT_DEFAULT_MIN_FONT_SIZE_PX,
  );
  const safeStep = Math.max(0.1, Number.isFinite(stepPx) ? stepPx : 0.5);

  useLayoutEffect(() => {
    const el = spanRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    let rafId = 0;

    const fit = () => {
      if (!el || !parent) return;
      // Descobre a fonte base uma única vez (respeita as classes utilitárias).
      if (baseFontSizeRef.current == null) {
        const cs = window.getComputedStyle(el);
        const parsed = parseFloat(cs.fontSize);
        baseFontSizeRef.current = Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
      }
      const base = baseFontSizeRef.current;
      // Reset para a base antes de medir — evita "encolher-crescer" preso no piso.
      el.style.fontSize = `${base}px`;

      const availableW = parent.clientWidth;
      if (availableW <= 0) return;

      // Ajuda o cálculo de altura em multi-line: garante que o line-height
      // esteja resolvido no computed style antes de medir.
      const readLineHeight = () => {
        const cs = window.getComputedStyle(el);
        const lh = parseFloat(cs.lineHeight);
        if (Number.isFinite(lh) && lh > 0) return lh;
        // Fallback ~1.4× o font-size atual quando line-height = "normal".
        const fs = parseFloat(cs.fontSize) || base;
        return fs * 1.4;
      };

      const overflowsAtCurrentSize = () => {
        if (safeMaxLines === 1) {
          return el.scrollWidth > availableW + 0.5;
        }
        // Multi-line: comparamos altura contra o teto de `maxLines * lh`.
        const maxHeight = readLineHeight() * safeMaxLines;
        return el.scrollHeight > maxHeight + 0.5;
      };

      let size = base;
      // Pior caso ~16 iterações (14 → 6 com passo 0.5). Guard extra para
      // proteger contra props inválidas em runtime.
      let guard = 64;
      while (overflowsAtCurrentSize() && size - safeStep >= safeMinFont && guard-- > 0) {
        size -= safeStep;
        el.style.fontSize = `${size}px`;
      }
      setOverflowing(overflowsAtCurrentSize());
    };

    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fit);
    };

    schedule();

    const ro = new ResizeObserver(schedule);
    ro.observe(parent);
    // Observa mudanças no próprio conteúdo (children que trocam de string).
    const mo = new MutationObserver(schedule);
    mo.observe(el, { characterData: true, childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      mo.disconnect();
    };
  }, [children, safeMinFont, safeStep, safeMaxLines]);

  const title = overflowing ? titleFallback ?? extractText(children) : undefined;
  const isMultiLine = safeMaxLines > 1;

  // No modo multi-line usamos line-clamp via inline style (compatível com
  // Tailwind v4 sem depender de plugin) para garantir corte visual quando
  // mesmo no piso o texto excede o número de linhas permitido.
  const multiLineStyle: React.CSSProperties = isMultiLine
    ? {
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: safeMaxLines,
        overflow: overflowing ? "hidden" : "visible",
        wordBreak: "break-word",
      }
    : { display: "block" };

  return (
    <span
      ref={spanRef}
      className={cn(
        isMultiLine ? "" : "block whitespace-nowrap",
        !isMultiLine && (overflowing ? "overflow-hidden text-ellipsis" : "overflow-visible"),
        className,
      )}
      title={title}
      style={multiLineStyle}
    >
      {children}
    </span>
  );
}
