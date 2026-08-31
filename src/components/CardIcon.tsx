import { useState } from "react";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg";

interface CardIconProps {
  color?: string | null;
  name?: string;
  logoUrl?: string | null;
  size?: Size;
  className?: string;
}

const MERCADO_PAGO_LOGO_URL = "https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/mercado-pago/default.svg";

const SIZE_MAP: Record<Size, { box: string; chip: string }> = {
  xs: { box: "h-5 w-7 rounded-sm",  chip: "left-[3px] top-[3px] h-1 w-1.5 rounded-[1px]" },
  sm: { box: "h-6 w-9 rounded-md",  chip: "left-1 top-1 h-1.5 w-2 rounded-[2px]" },
  md: { box: "h-7 w-10 rounded-md", chip: "left-1 top-1 h-1.5 w-2 rounded-[2px]" },
  lg: { box: "h-9 w-12 rounded-lg", chip: "left-1.5 top-1.5 h-2 w-2.5 rounded-[2px]" },
};

/**
 * Rectangular credit-card icon.
 * When a branded logo is available it is rendered inside the same fixed
 * footprint; otherwise the component falls back to the gradient card + chip.
 *
 * `logoUrl` is intended to come from `cards.logo_url`. The Mercado Pago name
 * fallback keeps legacy call sites branded while they do not yet pass the new
 * database field explicitly.
 */
export function CardIcon({ color, name, logoUrl, size = "md", className }: CardIconProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const s = SIZE_MAP[size];
  const namedFallbackLogo = name?.trim().toLowerCase() === "mercado pago" ? MERCADO_PAGO_LOGO_URL : null;
  const effectiveLogoUrl = logoUrl || namedFallbackLogo;
  const showLogo = Boolean(effectiveLogoUrl && !logoFailed);

  return (
    <div
      role="img"
      aria-label={name ? `Cartão ${name}` : "Cartão"}
      title={name}
      className={cn(
        // Base — fixed footprint, inset ring so state changes never resize the box
        "relative shrink-0 overflow-hidden",
        "shadow-sm ring-1 ring-inset ring-black/10",
        "transition-[box-shadow,opacity,filter] duration-200 ease-out",
        s.box,
        showLogo ? "bg-white" : "bg-gradient-to-br",
        !showLogo && (color || "from-primary/30 to-primary/10"),
        // Hover (from ancestor `.group`)
        "group-hover:shadow-md group-hover:ring-white/40",
        // Keyboard focus — two-tone inset ring (white core between dark halos)
        // guarantees ≥3:1 vs any gradient in both light & dark themes without
        // changing the outer box (all rings are inset).
        "group-focus-visible:ring-2 group-focus-visible:ring-white",
        "group-focus-visible:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.85),inset_0_0_0_4px_rgba(0,0,0,0.85)]",
        // Disabled — from a disabled button/link ancestor OR aria-disabled
        "group-disabled:opacity-40 group-disabled:saturate-50 group-disabled:shadow-none",
        "group-aria-disabled:opacity-40 group-aria-disabled:saturate-50 group-aria-disabled:shadow-none",
        className
      )}
    >
      {showLogo ? (
        <img
          src={effectiveLogoUrl!}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-contain p-0.5"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "absolute bg-white/70 transition-opacity duration-200",
            "group-disabled:opacity-60 group-aria-disabled:opacity-60",
            s.chip
          )}
        />
      )}
    </div>
  );
}
