type BrandPreset = {
  id: string;
  label: string;
  color: string;
};

export const brandPresets: BrandPreset[] = [
  { id: "visa",        label: "Visa",       color: "#1A1F71" },
  { id: "mastercard",  label: "Mastercard", color: "#EB001B" },
  { id: "elo",         label: "Elo",        color: "#000000" },
  { id: "amex",        label: "Amex",       color: "#006FCF" },
  { id: "hipercard",   label: "Hipercard",  color: "#D8232A" },
  { id: "diners",      label: "Diners",     color: "#0079BE" },
  { id: "discover",    label: "Discover",   color: "#FF6000" },
  { id: "jcb",         label: "JCB",        color: "#0E4C96" },
  { id: "custom",      label: "Outro",      color: "#6B7280" },
];

/* ---------- Minimalist brand marks (instantly recognizable, even small) ---------- */

function VisaMark() {
  // Iconic italic "VISA" wordmark — the brand IS the type.
  return (
    <text
      x="50" y="23" textAnchor="middle"
      fontFamily="'Helvetica Neue', Arial, sans-serif"
      fontWeight={900} fontSize="16" fontStyle="italic"
      letterSpacing="-0.8" fill="#1A1F71"
    >
      VISA
    </text>
  );
}

function MastercardMark() {
  // Two interlocking circles — the universally recognized symbol.
  return (
    <g transform="translate(50,18)">
      <circle cx="-6" cy="0" r="9" fill="#EB001B" />
      <circle cx="6"  cy="0" r="9" fill="#F79E1B" />
      <path d="M0,-7 a9 9 0 0 1 0 14 a9 9 0 0 1 0 -14z" fill="#FF5F00" />
    </g>
  );
}

function EloMark() {
  // Lowercase "elo" + the tri-color dot.
  return (
    <g>
      <text
        x="40" y="23" textAnchor="middle"
        fontFamily="Arial Black, sans-serif" fontWeight={900}
        fontSize="15" fill="currentColor" letterSpacing="-0.6"
      >elo</text>
      <circle cx="62" cy="18" r="5" fill="#FFCB05" />
      <path d="M62,13 a5 5 0 0 1 0 10 z" fill="#EF4123" />
      <path d="M62,13 a5 5 0 0 0 0 10 z" fill="#00A4E0" />
    </g>
  );
}

function AmexMark() {
  // Solid blue rounded square with "AMEX".
  return (
    <g>
      <rect x="28" y="8" width="44" height="20" rx="2.5" fill="#006FCF" />
      <text
        x="50" y="22" textAnchor="middle"
        fontFamily="Arial, sans-serif" fontWeight={800}
        fontSize="10" fill="#fff" letterSpacing="1"
      >AMEX</text>
    </g>
  );
}

function HipercardMark() {
  // Single bold red wordmark.
  return (
    <text
      x="50" y="22" textAnchor="middle"
      fontFamily="Arial Black, sans-serif" fontWeight={900}
      fontSize="10" fill="#D8232A" letterSpacing="-0.4"
    >HIPERCARD</text>
  );
}

function DinersMark() {
  // Two-half circle — Diners' classic split disc.
  return (
    <g transform="translate(50,18)">
      <circle r="9" fill="#0079BE" />
      <circle r="9" cx="3" fill="#fff" />
      <circle r="9" cx="-3" fill="#0079BE" />
      <circle r="9" cx="0" fill="none" stroke="#0079BE" strokeWidth="0.6" />
    </g>
  );
}

function DiscoverMark() {
  // "DISCOVER" + signature orange ball.
  return (
    <g>
      <text
        x="42" y="23" textAnchor="middle"
        fontFamily="Arial Black, sans-serif" fontWeight={900}
        fontSize="9" fill="currentColor" letterSpacing="-0.2"
      >DISCOVER</text>
      <circle cx="68" cy="18" r="5" fill="#FF6000" />
    </g>
  );
}

function JcbMark() {
  // Three colored stripes + JCB letters.
  return (
    <g>
      <rect x="30" y="8" width="13" height="20" rx="2" fill="#0E4C96" />
      <rect x="44" y="8" width="13" height="20" rx="2" fill="#E0001A" />
      <rect x="58" y="8" width="13" height="20" rx="2" fill="#00A94F" />
      <text x="36.5" y="22" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight={800} fontSize="9" fill="#fff">J</text>
      <text x="50.5" y="22" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight={800} fontSize="9" fill="#fff">C</text>
      <text x="64.5" y="22" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight={800} fontSize="9" fill="#fff">B</text>
    </g>
  );
}

function GenericMark() {
  // Two simple bars — abstract "card" hint.
  return (
    <g>
      <rect x="32" y="14" width="36" height="3" rx="1.5" fill="currentColor" opacity="0.55" />
      <rect x="32" y="20" width="22" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
    </g>
  );
}

const brandMarks: Record<string, React.FC> = {
  visa: VisaMark,
  mastercard: MastercardMark,
  elo: EloMark,
  amex: AmexMark,
  hipercard: HipercardMark,
  diners: DinersMark,
  discover: DiscoverMark,
  jcb: JcbMark,
  custom: GenericMark,
};

export function CardBrand({ brand, size = "md" }: { brand: string; size?: "sm" | "md" | "lg" }) {
  const preset = brandPresets.find(b => b.id === brand.toLowerCase()) || brandPresets[brandPresets.length - 1];
  const Mark = brandMarks[preset.id] || GenericMark;

  const dims = size === "sm"
    ? { w: 42, h: 32 }
    : size === "lg"
    ? { w: 72, h: 52 }
    : { w: 56, h: 42 };

  return (
    <div className="flex items-center justify-center" title={preset.label} style={{ color: "#111827" }}>
      <svg viewBox="0 0 100 36" width={dims.w} height={dims.h} aria-label={preset.label}>
        {/* White background for color-blind contrast */}
        <rect x="1" y="1" width="98" height="34" rx="5" fill="#ffffff" stroke="#e5e7eb" strokeWidth="0.8" />
        <Mark />
      </svg>
    </div>
  );
}
