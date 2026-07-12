import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * AutoFitText
 * ----------------------------------------------------------------
 * Renderiza um texto em **uma única linha** e, se ele não couber no
 * container, reduz proporcionalmente o `font-size` até caber (ou até
 * atingir `minFontSize`). Se mesmo no piso continuar transbordando,
 * cai para `text-overflow: ellipsis` (o mesmo comportamento antigo
 * do `truncate`), garantindo que o layout nunca quebre.
 *
 * Como funciona
 *  - Mede `scrollWidth` do próprio elemento contra `clientWidth` do
 *    seu pai (`flex-1 min-w-0`), via `ResizeObserver`, sempre que o
 *    container ou o conteúdo mudam.
 *  - Ajusta `fontSize` em pixels; a fonte base (`baseFontSizePx`) é
 *    lida do computed style na 1ª medição, então o componente
 *    respeita qualquer classe utilitária do Tailwind aplicada nele
 *    (`text-xs`, `text-sm`, `text-[10px]`…).
 *  - Nunca faz layout thrash: uma medição por RAF, com estado local
 *    guardado em `scaleRef` para evitar re-renderizações redundantes.
 *
 * Acessibilidade
 *  - Mantém o texto completo no DOM (não trunca em JS) — leitores de
 *    tela recebem o conteúdo inteiro.
 *  - Se ficar com ellipsis (piso atingido), expõe o texto original
 *    via `title` para tooltip nativo.
 */
export interface AutoFitTextProps {
  /** Conteúdo textual. Nós filhos não-textuais não são medidos com precisão — prefira strings. */
  children: React.ReactNode;
  /** Classe aplicada ao <span> raiz (tipografia, cor, peso). */
  className?: string;
  /** Piso do font-size em px. Default 10. */
  minFontSizePx?: number;
  /**
   * Passo de decremento em px. Default 0.5.
   * Menor = mais suave, custa mais medições — o ganho perceptual
   * abaixo de 0.5px é desprezível.
   */
  stepPx?: number;
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
  minFontSizePx = 10,
  stepPx = 0.5,
  titleFallback,
}: AutoFitTextProps) {
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const baseFontSizeRef = useRef<number | null>(null);
  const [overflowing, setOverflowing] = useState(false);

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
      // clientWidth do pai é o espaço disponível; contamos com `min-w-0` no pai.
      const available = parent.clientWidth;
      if (available <= 0) return;

      let size = base;
      // Loop enxuto: no pior caso ~10 iterações (14 → 10 com passo 0.5).
      while (el.scrollWidth > available && size - stepPx >= minFontSizePx) {
        size -= stepPx;
        el.style.fontSize = `${size}px`;
      }
      setOverflowing(el.scrollWidth > available + 0.5);
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
  }, [children, minFontSizePx, stepPx]);

  const title = overflowing ? titleFallback ?? extractText(children) : undefined;

  return (
    <span
      ref={spanRef}
      className={cn(
        "block whitespace-nowrap",
        overflowing ? "overflow-hidden text-ellipsis" : "overflow-visible",
        className,
      )}
      title={title}
      style={{ display: "block" }}
    >
      {children}
    </span>
  );
}
