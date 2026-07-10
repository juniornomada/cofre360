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
 *
 * Interactive states (driven by an ancestor with the `group` class):
 * - hover:   subtle shadow + brighter inset ring
 * - focus:   primary inset ring (no outer outline → no layout shift)
 * - disabled/aria-disabled: dimmed + desaturated
 *
 * All state changes use ring/opacity/filter only — box size stays fixed,
 * so the icon never shifts neighboring content when a card is hovered,
 * focused, or disabled.
 */
export function CardIcon({ color, name, size = "md", className }: CardIconProps) {
  const s = SIZE_MAP[size];
  return (
    <div
      role="img"
      aria-label={name ? `Cartão ${name}` : "Cartão"}
      title={name}
      className={cn(
        // Base — fixed footprint, inset ring so state changes never resize the box
        "relative shrink-0 bg-gradient-to-br overflow-hidden",
        "shadow-sm ring-1 ring-inset ring-black/10",
        "transition-[box-shadow,opacity,filter,--tw-ring-color,--tw-ring-shadow] duration-200 ease-out",
        s.box,
        color || "from-primary/30 to-primary/10",
        // Hover (from ancestor `.group`)
        "group-hover:shadow-md group-hover:ring-white/40",
        // Keyboard focus (from ancestor `.group`) — inset, no outer offset
        "group-focus-visible:ring-2 group-focus-visible:ring-primary",
        // Disabled — from a disabled button/link ancestor OR aria-disabled
        "group-disabled:opacity-40 group-disabled:saturate-50 group-disabled:shadow-none",
        "group-aria-disabled:opacity-40 group-aria-disabled:saturate-50 group-aria-disabled:shadow-none",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute bg-white/70 transition-opacity duration-200",
          "group-disabled:opacity-60 group-aria-disabled:opacity-60",
          s.chip
        )}
      />
    </div>
  );
}
