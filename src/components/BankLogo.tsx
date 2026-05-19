type BankPreset = {
  id: string;
  label: string;
  abbr: string;
  color: string;      // gradient classes
  textColor: string;   // text color for the abbreviation
  bgHex: string;       // solid bg for the logo circle
};

export const bankPresets: BankPreset[] = [
  { id: "bradesco",     label: "Bradesco",          abbr: "Br",  color: "from-red-600 to-red-800",      textColor: "text-white",       bgHex: "#CC092F" },
  { id: "bb",           label: "Banco do Brasil",   abbr: "BB",  color: "from-yellow-400 to-yellow-600", textColor: "text-blue-900",    bgHex: "#FDDF00" },
  { id: "caixa",        label: "Caixa Econômica",   abbr: "CX",  color: "from-blue-600 to-blue-900",    textColor: "text-white",       bgHex: "#005CA9" },
  { id: "nubank",       label: "Nubank",            abbr: "Nu",  color: "from-purple-500 to-purple-800", textColor: "text-white",       bgHex: "#820AD1" },
  { id: "mercadopago",  label: "Mercado Pago",      abbr: "MP",  color: "from-blue-400 to-blue-600",    textColor: "text-white",       bgHex: "#009EE3" },
  { id: "itau",         label: "Itaú",              abbr: "Itaú", color: "from-orange-500 to-orange-700", textColor: "text-blue-900",   bgHex: "#FF6600" },
  { id: "santander",    label: "Santander",         abbr: "San", color: "from-red-500 to-red-700",      textColor: "text-white",       bgHex: "#EC0000" },
  { id: "inter",        label: "Inter",             abbr: "Int", color: "from-orange-500 to-orange-600", textColor: "text-white",       bgHex: "#FF7A00" },
  { id: "c6",           label: "C6 Bank",           abbr: "C6",  color: "from-gray-800 to-gray-950",    textColor: "text-yellow-400",  bgHex: "#1A1A1A" },
  { id: "picpay",       label: "PicPay",            abbr: "PP",  color: "from-green-500 to-green-700",  textColor: "text-white",       bgHex: "#21C25E" },
  { id: "neon",         label: "Neon",              abbr: "Ne",  color: "from-cyan-400 to-cyan-600",    textColor: "text-white",       bgHex: "#00C8F8" },
  { id: "pagbank",      label: "PagBank",           abbr: "PB",  color: "from-green-400 to-green-600",  textColor: "text-white",       bgHex: "#00A868" },
  { id: "next",         label: "Next",              abbr: "Nx",  color: "from-green-500 to-green-800",  textColor: "text-white",       bgHex: "#00E364" },
  { id: "original",     label: "Original",          abbr: "Or",  color: "from-green-600 to-green-900",  textColor: "text-white",       bgHex: "#004D25" },
  { id: "safra",        label: "Safra",             abbr: "Sf",  color: "from-blue-800 to-blue-950",    textColor: "text-yellow-400",  bgHex: "#003366" },
  { id: "sicoob",       label: "Sicoob",            abbr: "Si",  color: "from-green-600 to-green-800",  textColor: "text-white",       bgHex: "#003641" },
  { id: "sicredi",      label: "Sicredi",           abbr: "Sc",  color: "from-green-500 to-green-700",  textColor: "text-white",       bgHex: "#33A02C" },
  { id: "will",         label: "Will Bank",         abbr: "Wi",  color: "from-yellow-400 to-yellow-500", textColor: "text-gray-900",   bgHex: "#FFD100" },
  { id: "btg",          label: "BTG Pactual",       abbr: "BTG", color: "from-blue-900 to-blue-950",    textColor: "text-white",       bgHex: "#00234B" },
  { id: "xp",           label: "XP",                abbr: "XP",  color: "from-gray-900 to-black",       textColor: "text-white",       bgHex: "#1D1D1B" },
  { id: "custom",       label: "Outro",             abbr: "🏦",  color: "from-gray-500 to-gray-700",    textColor: "text-white",       bgHex: "#6B7280" },
];

export function BankLogo({ icon, color, size = "md" }: { icon: string; color: string; size?: "sm" | "md" | "lg" }) {
  const preset = bankPresets.find(b => b.id === icon);
  const sizeClasses = size === "sm" ? "h-8 w-8 text-[10px]" : size === "lg" ? "h-14 w-14 text-base" : "h-12 w-12 text-sm";

  if (preset && preset.id !== "custom") {
    return (
      <div
        className={`flex items-center justify-center rounded-xl font-bold ${sizeClasses}`}
        style={{ backgroundColor: preset.bgHex, color: preset.textColor.includes("white") ? "#fff" : undefined }}
      >
        <span className={preset.textColor.includes("white") ? "" : preset.textColor}>
          {preset.abbr}
        </span>
      </div>
    );
  }

  // Fallback: emoji-based (legacy or custom)
  return (
    <div className={`flex items-center justify-center rounded-xl bg-gradient-to-br ${color} text-xl ${sizeClasses}`}>
      {icon}
    </div>
  );
}
