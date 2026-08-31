type BankPreset = {
  id: string;
  label: string;
  abbr: string;
  color: string;
  textColor: string;
  bgHex: string;
  logoUrl?: string;
  aliases?: string[];
};

const BANK_ICON_BASE = "https://henriquezolini.github.io/react-bancos/icons";

export const bankPresets: BankPreset[] = [
  { id: "bradesco", label: "Bradesco", abbr: "Br", color: "from-red-600 to-red-800", textColor: "text-white", bgHex: "#CC092F", logoUrl: `${BANK_ICON_BASE}/bradesco.svg` },
  { id: "bb", label: "Banco do Brasil", abbr: "BB", color: "from-yellow-400 to-yellow-600", textColor: "text-blue-900", bgHex: "#FDDF00", logoUrl: `${BANK_ICON_BASE}/bancodobrasil.svg`, aliases: ["bb"] },
  { id: "caixa", label: "Caixa Econômica", abbr: "CX", color: "from-blue-600 to-blue-900", textColor: "text-white", bgHex: "#005CA9", logoUrl: `${BANK_ICON_BASE}/caixa.svg`, aliases: ["caixa economica federal", "cef"] },
  { id: "nubank", label: "Nubank", abbr: "Nu", color: "from-purple-500 to-purple-800", textColor: "text-white", bgHex: "#820AD1", logoUrl: `${BANK_ICON_BASE}/nubank.svg` },
  { id: "mercadopago", label: "Mercado Pago", abbr: "MP", color: "from-blue-400 to-blue-600", textColor: "text-white", bgHex: "#009EE3", logoUrl: `${BANK_ICON_BASE}/mercadopago.svg` },
  { id: "itau", label: "Itaú", abbr: "Itaú", color: "from-orange-500 to-orange-700", textColor: "text-blue-900", bgHex: "#FF6600", logoUrl: `${BANK_ICON_BASE}/itau.svg`, aliases: ["itau unibanco"] },
  { id: "santander", label: "Santander", abbr: "San", color: "from-red-500 to-red-700", textColor: "text-white", bgHex: "#EC0000", logoUrl: `${BANK_ICON_BASE}/santander.svg` },
  { id: "inter", label: "Inter", abbr: "Int", color: "from-orange-500 to-orange-600", textColor: "text-white", bgHex: "#FF7A00", logoUrl: `${BANK_ICON_BASE}/inter.svg`, aliases: ["banco inter"] },
  { id: "c6", label: "C6 Bank", abbr: "C6", color: "from-gray-800 to-gray-950", textColor: "text-yellow-400", bgHex: "#1A1A1A", logoUrl: `${BANK_ICON_BASE}/c6bank.svg`, aliases: ["c6"] },
  { id: "picpay", label: "PicPay", abbr: "PP", color: "from-green-500 to-green-700", textColor: "text-white", bgHex: "#21C25E", logoUrl: `${BANK_ICON_BASE}/picpay.svg` },
  { id: "neon", label: "Neon", abbr: "Ne", color: "from-cyan-400 to-cyan-600", textColor: "text-white", bgHex: "#00C8F8", logoUrl: `${BANK_ICON_BASE}/neon.svg` },
  { id: "pagbank", label: "PagBank", abbr: "PB", color: "from-green-400 to-green-600", textColor: "text-white", bgHex: "#00A868", logoUrl: `${BANK_ICON_BASE}/pagbank.svg` },
  { id: "next", label: "Next", abbr: "Nx", color: "from-green-500 to-green-800", textColor: "text-white", bgHex: "#00E364", logoUrl: `${BANK_ICON_BASE}/next.svg` },
  { id: "original", label: "Original", abbr: "Or", color: "from-green-600 to-green-900", textColor: "text-white", bgHex: "#004D25", logoUrl: `${BANK_ICON_BASE}/original.svg`, aliases: ["banco original"] },
  { id: "safra", label: "Safra", abbr: "Sf", color: "from-blue-800 to-blue-950", textColor: "text-yellow-400", bgHex: "#003366", logoUrl: `${BANK_ICON_BASE}/safra.svg`, aliases: ["banco safra"] },
  { id: "sicoob", label: "Sicoob", abbr: "Si", color: "from-green-600 to-green-800", textColor: "text-white", bgHex: "#003641", logoUrl: `${BANK_ICON_BASE}/sicoob.svg` },
  { id: "sicredi", label: "Sicredi", abbr: "Sc", color: "from-green-500 to-green-700", textColor: "text-white", bgHex: "#33A02C", logoUrl: `${BANK_ICON_BASE}/sicredi.svg` },
  { id: "will", label: "Will Bank", abbr: "Wi", color: "from-yellow-400 to-yellow-500", textColor: "text-gray-900", bgHex: "#FFD100", logoUrl: `${BANK_ICON_BASE}/willbank.svg`, aliases: ["will"] },
  { id: "btg", label: "BTG Pactual", abbr: "BTG", color: "from-blue-900 to-blue-950", textColor: "text-white", bgHex: "#00234B", logoUrl: `${BANK_ICON_BASE}/btgpactual.svg`, aliases: ["btg"] },
  { id: "xp", label: "XP", abbr: "XP", color: "from-gray-900 to-black", textColor: "text-white", bgHex: "#1D1D1B", logoUrl: `${BANK_ICON_BASE}/xp.svg` },
  { id: "flash", label: "Flash", abbr: "Fl", color: "from-pink-500 to-pink-700", textColor: "text-white", bgHex: "#FF007F", logoUrl: `${BANK_ICON_BASE}/flash.svg`, aliases: ["flash beneficios"] },
  { id: "alelo", label: "Alelo", abbr: "Al", color: "from-green-500 to-green-800", textColor: "text-white", bgHex: "#008C44", logoUrl: `${BANK_ICON_BASE}/alelo.svg` },
  { id: "wise", label: "Wise", abbr: "Wi", color: "from-green-400 to-green-600", textColor: "text-blue-900", bgHex: "#9FE870", logoUrl: `${BANK_ICON_BASE}/wise.svg` },
  { id: "nomad", label: "Nomad", abbr: "No", color: "from-green-300 to-green-500", textColor: "text-black", bgHex: "#CCFF00", logoUrl: `${BANK_ICON_BASE}/nomad.svg` },
  { id: "revolut", label: "Revolut", abbr: "Re", color: "from-blue-500 to-blue-700", textColor: "text-white", bgHex: "#000000", logoUrl: `${BANK_ICON_BASE}/revolut.svg` },
  { id: "modal", label: "Modalmais", abbr: "Md", color: "from-blue-600 to-blue-800", textColor: "text-white", bgHex: "#0057B8" },
  { id: "banrisul", label: "Banrisul", abbr: "Ba", color: "from-blue-700 to-blue-900", textColor: "text-white", bgHex: "#004A99", logoUrl: `${BANK_ICON_BASE}/banrisul.svg` },
  { id: "cash", label: "Dinheiro", abbr: "💵", color: "from-slate-300 to-slate-500", textColor: "text-gray-900", bgHex: "#CBD5E1", aliases: ["dinheiro", "cash"] },
  { id: "custom", label: "Outro", abbr: "🏦", color: "from-gray-500 to-gray-700", textColor: "text-white", bgHex: "#6B7280" },
];

function normalizeBankName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function findPresetByName(name?: string) {
  if (!name) return undefined;
  const normalizedName = normalizeBankName(name);
  return bankPresets.find((bank) => {
    if (normalizeBankName(bank.label) === normalizedName) return true;
    return bank.aliases?.some((alias) => normalizeBankName(alias) === normalizedName);
  });
}

function getAbbreviation(name: string) {
  if (!name || name === "custom") return "🏦";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

export function BankLogo({ icon, color, name, size = "md" }: { icon?: string | null; color?: string | null; name?: string; size?: "xs" | "sm" | "md" | "lg" }) {
  const safeIcon = icon || "custom";
  const safeColor = color || "from-gray-500 to-gray-700";
  const preset = bankPresets.find(b => b.id === safeIcon) || findPresetByName(name);
  const sizeClasses = size === "xs" ? "h-5 w-5 text-[8px]" : size === "sm" ? "h-8 w-8 text-[10px]" : size === "lg" ? "h-14 w-14 text-base" : "h-12 w-12 text-sm";
  const radiusClasses = size === "xs" ? "rounded-md" : "rounded-xl";

  if (preset && preset.id !== "custom") {
    return (
      <div className={`flex items-center justify-center ${radiusClasses} font-bold overflow-hidden bg-white shadow-sm ${sizeClasses}`} style={{ color: preset.textColor.includes("white") ? "#fff" : undefined }}>
        {preset.logoUrl ? (
          <img src={preset.logoUrl} alt={preset.label} className="w-full h-full object-contain" onError={(e) => {
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
