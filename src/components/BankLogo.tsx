type BankPreset = {
  id: string;
  label: string;
  abbr: string;
  color: string;
  textColor: string;
  bgHex: string;
  logoUrl?: string;
};

export const bankPresets: BankPreset[] = [
  { id: "bradesco", label: "Bradesco", abbr: "Br", color: "from-red-600 to-red-800", textColor: "text-white", bgHex: "#CC092F", logoUrl: "https://banco.bradesco/assets/common/img/novo-logo-bradesco.png" },
  { id: "bb", label: "Banco do Brasil", abbr: "BB", color: "from-yellow-400 to-yellow-600", textColor: "text-blue-900", bgHex: "#FDDF00" },
  { id: "caixa", label: "Caixa Econômica", abbr: "CX", color: "from-blue-600 to-blue-900", textColor: "text-white", bgHex: "#005CA9" },
  { id: "nubank", label: "Nubank", abbr: "Nu", color: "from-purple-500 to-purple-800", textColor: "text-white", bgHex: "#820AD1" },
  { id: "mercadopago", label: "Mercado Pago", abbr: "MP", color: "from-blue-400 to-blue-600", textColor: "text-white", bgHex: "#009EE3" },
  { id: "itau", label: "Itaú", abbr: "Itaú", color: "from-orange-500 to-orange-700", textColor: "text-blue-900", bgHex: "#FF6600" },
  { id: "santander", label: "Santander", abbr: "San", color: "from-red-500 to-red-700", textColor: "text-white", bgHex: "#EC0000" },
  { id: "inter", label: "Inter", abbr: "Int", color: "from-orange-500 to-orange-600", textColor: "text-white", bgHex: "#FF7A00" },
  { id: "c6", label: "C6 Bank", abbr: "C6", color: "from-gray-800 to-gray-950", textColor: "text-yellow-400", bgHex: "#1A1A1A" },
  { id: "picpay", label: "PicPay", abbr: "PP", color: "from-green-500 to-green-700", textColor: "text-white", bgHex: "#21C25E" },
  { id: "neon", label: "Neon", abbr: "Ne", color: "from-cyan-400 to-cyan-600", textColor: "text-white", bgHex: "#00C8F8" },
  { id: "pagbank", label: "PagBank", abbr: "PB", color: "from-green-400 to-green-600", textColor: "text-white", bgHex: "#00A868" },
  { id: "next", label: "Next", abbr: "Nx", color: "from-green-500 to-green-800", textColor: "text-white", bgHex: "#00E364" },
  { id: "original", label: "Original", abbr: "Or", color: "from-green-600 to-green-900", textColor: "text-white", bgHex: "#004D25" },
  { id: "safra", label: "Safra", abbr: "Sf", color: "from-blue-800 to-blue-950", textColor: "text-yellow-400", bgHex: "#003366" },
  { id: "sicoob", label: "Sicoob", abbr: "Si", color: "from-green-600 to-green-800", textColor: "text-white", bgHex: "#003641" },
  { id: "sicredi", label: "Sicredi", abbr: "Sc", color: "from-green-500 to-green-700", textColor: "text-white", bgHex: "#33A02C" },
  { id: "will", label: "Will Bank", abbr: "Wi", color: "from-yellow-400 to-yellow-500", textColor: "text-gray-900", bgHex: "#FFD100" },
  { id: "btg", label: "BTG Pactual", abbr: "BTG", color: "from-blue-900 to-blue-950", textColor: "text-white", bgHex: "#00234B" },
  { id: "xp", label: "XP", abbr: "XP", color: "from-gray-900 to-black", textColor: "text-white", bgHex: "#1D1D1B" },
  { id: "flash", label: "Flash", abbr: "Fl", color: "from-pink-500 to-pink-700", textColor: "text-white", bgHex: "#FF007F" },
  { id: "wise", label: "Wise", abbr: "Wi", color: "from-green-400 to-green-600", textColor: "text-blue-900", bgHex: "#9FE870" },
  { id: "nomad", label: "Nomad", abbr: "No", color: "from-green-300 to-green-500", textColor: "text-black", bgHex: "#CCFF00" },
  { id: "revolut", label: "Revolut", abbr: "Re", color: "from-blue-500 to-blue-700", textColor: "text-white", bgHex: "#000000" },
  { id: "modal", label: "Modalmais", abbr: "Md", color: "from-blue-600 to-blue-800", textColor: "text-white", bgHex: "#0057B8" },
  { id: "banrisul", label: "Banrisul", abbr: "Ba", color: "from-blue-700 to-blue-900", textColor: "text-white", bgHex: "#004A99" },
  { id: "custom", label: "Outro", abbr: "🏦", color: "from-gray-500 to-gray-700", textColor: "text-white", bgHex: "#6B7280" },
];

function getAbbreviation(name: string) {
  if (!name || name === "custom") return "🏦";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

export function BankLogo({ icon, color, name, size = "md" }: { icon?: string | null; color?: string | null; name?: string; size?: "xs" | "sm" | "md" | "lg" }) {
  const safeIcon = icon || "custom";
  const safeColor = color || "from-gray-500 to-gray-700";
  const preset = bankPresets.find(b => b.id === safeIcon);
  const sizeClasses = size === "xs" ? "h-5 w-5 text-[8px]" : size === "sm" ? "h-8 w-8 text-[10px]" : size === "lg" ? "h-14 w-14 text-base" : "h-12 w-12 text-sm";
  const radiusClasses = size === "xs" ? "rounded-md" : "rounded-xl";

  if (preset && preset.id !== "custom") {
    return (
      <div className={`flex items-center justify-center ${radiusClasses} font-bold overflow-hidden bg-white shadow-sm ${sizeClasses}`} style={{ color: preset.textColor.includes("white") ? "#fff" : undefined }}>
        {preset.logoUrl ? (
          <img src={preset.logoUrl} alt={preset.label} className="w-full h-full object-contain p-1.5" onError={(e) => {
            e.currentTarget.style.display = "none";
            const parent = e.currentTarget.parentElement;
            if (parent) {
              parent.style.backgroundColor = preset.bgHex;
              const span = document.createElement("span");
              span.innerText = preset.abbr;
              span.className = preset.textColor.includes("white") ? "text-white" : preset.textColor;
              parent.appendChild(span);
            }
          }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: preset.bgHex }}>
            <span className={preset.textColor.includes("white") ? "text-white" : preset.textColor}>{preset.abbr}</span>
          </div>
        )}
      </div>
    );
  }

  const displayIcon = safeIcon === "custom" ? getAbbreviation(name || "") : safeIcon;
  return (
    <div className={`flex items-center justify-center ${radiusClasses} bg-gradient-to-br ${safeColor} ${displayIcon.length > 2 ? (size === "xs" ? "text-[10px]" : "text-xl") : (size === "xs" ? "text-[8px] font-bold" : "text-xs font-bold")} text-white ${sizeClasses}`}>
      {displayIcon}
    </div>
  );
}