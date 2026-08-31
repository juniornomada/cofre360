import { useState } from "react";
import { cn } from "@/lib/utils";
import { inferCardInstitutionLogoUrl } from "@/lib/card-institution-logo";

type Size = "xs" | "sm" | "md" | "lg";

interface CardIconProps {
  color?: string | null;
  name?: string;
  logoUrl?: string | null;
  size?: Size;
  className?: string;
}

const SIZE_MAP: Record<Size, { box: string; chip: string }> = {
  xs: { box: "h-5 w-7 rounded-sm", chip: "left-[3px] top-[3px] h-1 w-1.5 rounded-[1px]" },
  sm: { box: "h-6 w-9 rounded-md", chip: "left-1 top-1 h-1.5 w-2 rounded-[2px]" },
  md: { box: "h-7 w-10 rounded-md", chip: "left-1 top-1 h-1.5 w-2 rounded-[2px]" },
  lg: { box: "h-9 w-12 rounded-lg", chip: "left-1.5 top-1.5 h-2 w-2.5 rounded-[2px]" },
};

/**
 * Credit-card icon with optional institution branding.
 * `cards.logo_url` remains the primary source; the institution catalog is a
 * fallback for legacy call sites and newly supported banks.
 */
export function CardIcon({ color, name, logoUrl, size = "md", className }: CardIconProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const s = SIZE_MAP[size];
  const normalizedName = name?.trim().toLowerCase();
  const isMercadoPago = normalizedName === "mercado pago";
  const isPortoBank = normalizedName === "porto bank";
  const namedFallbackLogo = inferCardInstitutionLogoUrl(name);
  const effectiveLogoUrl = logoUrl || namedFallbackLogo;
  const showLogo = Boolean(effectiveLogoUrl && !logoFailed);

  return (
    <div
      role="img"
      aria-label={name ? `Cartão ${name}` : "Cartão"}
      title={name}
      className={cn(
        "relative shrink-0 overflow-hidden",
        "transition-[box-shadow,opacity,filter] duration-200 ease-out",
        s.box,
        "shadow-sm ring-1 ring-inset ring-black/10",
        showLogo ? "bg-white" : "bg-gradient-to-br",
        !showLogo && (color || "from-primary/30 to-primary/10"),
        "group-hover:shadow-md group-hover:ring-white/40",
        "group-focus-visible:ring-2 group-focus-visible:ring-white",
        "group-focus-visible:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.85),inset_0_0_0_4px_rgba(0,0,0,0.85)]",
        "group-disabled:opacity-40 group-disabled:saturate-50 group-disabled:shadow-none",
        "group-aria-disabled:opacity-40 group-aria-disabled:saturate-50 group-aria-disabled:shadow-none",
        className
      )}
    >
      {showLogo ? (
        <div className="flex h-full w-full items-center justify-center p-0.5">
          <img
            src={effectiveLogoUrl!}
            alt=""
            aria-hidden="true"
            className={cn(
              "max-h-[78%] max-w-[78%] object-contain",
              isMercadoPago && "scale-[0.94]",
              isPortoBank && "scale-100"
            )}
            onError={() => setLogoFailed(true)}
          />
        </div>
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
