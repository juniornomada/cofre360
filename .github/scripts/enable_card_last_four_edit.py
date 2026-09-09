from pathlib import Path

p = Path('src/routes/cards.tsx')
s = p.read_text(encoding='utf-8')

def replace_once(old: str, new: str, label: str):
    global s
    if old not in s:
        raise SystemExit(f'anchor not found: {label}')
    s = s.replace(old, new, 1)

replace_once(
    '  const [editBrand, setEditBrand] = useState("");\n  const [editLimit, setEditLimit] = useState("");',
    '  const [editBrand, setEditBrand] = useState("");\n  const [editLastFour, setEditLastFour] = useState("");\n  const [editLimit, setEditLimit] = useState("");',
    'state',
)

replace_once(
    '    setEditName(card.name);\n    setEditBrand(card.brand);\n    setEditLimit(card.card_limit.toString());',
    '    setEditName(card.name);\n    setEditBrand(card.brand);\n    setEditLastFour(String(card.last_four ?? "").replace(/\\D/g, "").slice(-4).padStart(4, "0"));\n    setEditLimit(card.card_limit.toString());',
    'startEdit',
)

replace_once(
    '  const saveEdit = async (id: string) => {\n    try {\n      const { error } = await supabase.from("cards").update({\n        name: editName.trim() || "Cartão",\n        brand: editBrand || "custom",',
    '  const saveEdit = async (id: string) => {\n    const normalizedLastFour = editLastFour.replace(/\\D/g, "").slice(-4);\n    if (normalizedLastFour.length !== 4) {\n      toast.error("Informe os 4 últimos dígitos do cartão");\n      return;\n    }\n    try {\n      const { error } = await supabase.from("cards").update({\n        name: editName.trim() || "Cartão",\n        brand: editBrand || "custom",\n        last_four: normalizedLastFour,',
    'saveEdit',
)

brand_block = '''                      <div className="flex items-center gap-2">
                        <span className="text-[10px] opacity-70 w-14">Bandeira</span>
                        <div className="flex gap-1 flex-wrap">
                          {brandPresets.map((bp) => (
                            <button
                              key={bp.id}
                              type="button"
                              onClick={() => setEditBrand(bp.id)}
                              data-on-card="true"
                              aria-pressed={editBrand.toLowerCase() === bp.id.toLowerCase()}
                              className={cn(
                                "px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors",
                                editBrand.toLowerCase() === bp.id.toLowerCase() ? "bg-white text-black" : "bg-white/20 text-white hover:bg-white/30"
                              )}
                            >
                              {bp.label}
                            </button>
                          ))}
                        </div>
                      </div>
'''
last_four_block = brand_block + '''                      <div className="flex items-center gap-2">
                        <span className="text-[10px] opacity-70 w-14">Final</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-mono text-white/75">••••</span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            autoComplete="cc-number"
                            value={editLastFour}
                            onChange={(e) => setEditLastFour(e.target.value.replace(/\\D/g, "").slice(0, 4))}
                            maxLength={4}
                            aria-label="Quatro últimos dígitos do cartão"
                            className="h-7 w-16 rounded-lg bg-white/20 border-white/30 text-white text-xs font-mono tabular-nums tracking-wider"
                            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(card.id); if (e.key === "Escape") cancelEdit(); }}
                          />
                        </div>
                      </div>
'''
replace_once(brand_block, last_four_block, 'ui')

p.write_text(s, encoding='utf-8')
