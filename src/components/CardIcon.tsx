import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg";

interface CardIconProps {
  color?: string | null;
  name?: string;
  size?: Size;
  className?: string;
}

const SIZE_MAP: Record<Size, { box: string; chip: string }> = {
  xs: { box: "h-5 w-7 rounded-sm",  chip: "left-[3px] top-[3px] h-1 w-1.5 rounded-[1px]" },
  sm: { box: "h-6 w-9 rounded-md",  chip: "left-1 top-1 h-1.5 w-2 rounded-[2px]" },
  md: { box: "h-7 w-10 rounded-md", chip: "left-1 top-1 h-1.5 w-2 rounded-[2px]" },
  lg: { box: "h-9 w-12 rounded-lg", chip: "left-1.5 top-1.5 h-2 w-2.5 rounded-[2px]" },
};

/**
 * Rectangular credit-card icon (gradient body + chip).
 * Standardized across all screens — no emoji, no circular container.
 */
export function CardIcon({ color, name, size = "md", className }: CardIconProps) {
  const s = SIZE_MAP[size];
  return (
    <div
      role="img"
      aria-label={name ? `Cartão ${name}` : "Cartão"}
      title={name}
      className={cn(
        "relative shrink-0 bg-gradient-to-br shadow-sm ring-1 ring-black/5 overflow-hidden",
        s.box,
        color || "from-primary/30 to-primary/10",
        className
      )}
    >
      <span className={cn("absolute bg-white/70", s.chip)} aria-hidden />
    </div>
  );
}
