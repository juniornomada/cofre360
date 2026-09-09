from pathlib import Path

p = Path('src/routes/invest.tsx')
s = p.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 anchor, found {count}')
    s = s.replace(old, new, 1)


replace_once(
'''  { value: "etf", label: "ETF", icon: "📊" },
  { value: "outro", label: "Outro", icon: "💎" },''',
'''  { value: "etf", label: "ETF", icon: "📊" },
  { value: "pos_fixado", label: "Pós-Fixado", icon: "🟡" },
  { value: "alternativos", label: "Alternativos", icon: "🟣" },
  { value: "renda_variavel_global", label: "Renda Variável Global", icon: "🌎" },
  { value: "renda_variavel_brasil", label: "Renda Variável Brasil", icon: "🇧🇷" },
  { value: "outro", label: "Outro", icon: "💎" },''',
'asset class options',
)

replace_once(
'''  value: string;
  purchase_date: string;
  yield_rate: string;''',
'''  value: string;
  invested_amount: string;
  current_gross_value: string;
  current_net_value: string;
  risk_level: string;
  risk_score: string;
  redemption_quote: string;
  redemption_settlement: string;
  purchase_date: string;
  yield_rate: string;''',
'form state fields',
)

replace_once(
'''  value: "",
  purchase_date: new Date().toISOString().slice(0, 10),''',
'''  value: "",
  invested_amount: "",
  current_gross_value: "",
  current_net_value: "",
  risk_level: "",
  risk_score: "",
  redemption_quote: "",
  redemption_settlement: "",
  purchase_date: new Date().toISOString().slice(0, 10),''',
'empty form fields',
)

replace_once(
'''      value: inv.value != null ? String(inv.value).replace(".", ",") : "",
      purchase_date: inv.purchase_date || new Date().toISOString().slice(0, 10),''',
'''      value: inv.value != null ? String(inv.value).replace(".", ",") : "",
      invested_amount: inv.invested_amount != null
        ? String(inv.invested_amount).replace(".", ",")
        : (inv.value != null ? String(inv.value).replace(".", ",") : ""),
      current_gross_value: inv.current_gross_value != null ? String(inv.current_gross_value).replace(".", ",") : "",
      current_net_value: inv.current_net_value != null ? String(inv.current_net_value).replace(".", ",") : "",
      risk_level: inv.risk_level || "",
      risk_score: inv.risk_score != null ? String(inv.risk_score).replace(".", ",") : "",
      redemption_quote: inv.redemption_quote || "",
      redemption_settlement: inv.redemption_settlement || "",
      purchase_date: inv.purchase_date || new Date().toISOString().slice(0, 10),''',
'open edit manual fields',
)

replace_once(
'''      const variable = isVariable(form.asset_class);
      const qty = parseNum(form.quantity);
      const px = parseNum(form.purchase_price);
      const value = variable ? qty * px : parseNum(form.value);
      const payload: any = {
        name: form.name,
        icon: form.icon,
        type: ASSET_CLASS_LABELS[form.asset_class] || "Outro",
        asset_class: form.asset_class,
        asset_code: form.asset_code || null,
        quantity: form.quantity ? qty : null,
        purchase_price: form.purchase_price ? px : null,
        purchase_date: form.purchase_date || null,
        yield_rate: form.yield_rate ? parseNum(form.yield_rate) : null,
        admin_fee: form.admin_fee ? parseNum(form.admin_fee) : null,
        maturity_date: form.maturity_date || null,
        value: value || 0,
        change: 0,
      };''',
'''      const variable = isVariable(form.asset_class);
      const qty = parseNum(form.quantity);
      const px = parseNum(form.purchase_price);
      const derivedInvested = variable ? qty * px : parseNum(form.invested_amount || form.value);
      const manualGross = form.current_gross_value.trim() ? parseNum(form.current_gross_value) : null;
      const manualNet = form.current_net_value.trim() ? parseNum(form.current_net_value) : null;
      const manualChange = manualGross != null && derivedInvested > 0
        ? ((manualGross - derivedInvested) / derivedInvested) * 100
        : 0;
      const payload: any = {
        name: form.name,
        icon: form.icon,
        type: ASSET_CLASS_LABELS[form.asset_class] || "Outro",
        asset_class: form.asset_class,
        asset_code: form.asset_code || null,
        quantity: form.quantity ? qty : null,
        purchase_price: form.purchase_price ? px : null,
        purchase_date: form.purchase_date || null,
        yield_rate: form.yield_rate ? parseNum(form.yield_rate) : null,
        admin_fee: form.admin_fee ? parseNum(form.admin_fee) : null,
        maturity_date: form.maturity_date || null,
        invested_amount: derivedInvested || 0,
        current_gross_value: manualGross,
        current_net_value: manualNet,
        risk_level: form.risk_level || null,
        risk_score: form.risk_score.trim() ? parseNum(form.risk_score) : null,
        redemption_quote: form.redemption_quote || null,
        redemption_settlement: form.redemption_settlement || null,
        last_manual_update: (manualGross != null || manualNet != null) ? new Date().toISOString() : null,
        value: derivedInvested || 0,
        change: manualChange,
      };''',
'handle save payload',
)

replace_once(
'''                  <p className="text-sm font-medium text-foreground truncate">{inv.name}</p>''',
'''                  <p className="text-sm font-semibold leading-snug text-foreground line-clamp-2">{inv.name}</p>''',
'title visibility',
)

replace_once(
'''                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setDetail(inv)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-muted-foreground hover:text-foreground"''',
'''                <div className="flex gap-1">
                  <button
                    onClick={() => setDetail(inv)}
                    className="hidden sm:flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-muted-foreground hover:text-foreground"''',
'actions visibility',
)

replace_once(
'''                  <button
                    onClick={() => openEdit(inv)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-muted-foreground hover:text-foreground"''',
'''                  <button
                    onClick={() => openEdit(inv)}
                    className="hidden sm:flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-muted-foreground hover:text-foreground"''',
'edit visibility',
)

replace_once(
'''            ) : (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Valor investido (R$)</label>
                <input
                  inputMode="decimal"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder="0,00"
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Data de compra</label>''',
'''            ) : (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Aporte original (R$)</label>
                <input
                  inputMode="decimal"
                  value={form.invested_amount}
                  onChange={(e) => setForm({ ...form, invested_amount: e.target.value, value: e.target.value })}
                  placeholder="0,00"
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none"
                />
              </div>
            )}

            <div className="rounded-xl border border-border/60 bg-card/50 p-3">
              <p className="mb-2 text-xs font-semibold text-foreground">Valores atuais</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Bruto atual (R$)</label>
                  <input
                    inputMode="decimal"
                    value={form.current_gross_value}
                    onChange={(e) => setForm({ ...form, current_gross_value: e.target.value })}
                    placeholder="0,00"
                    className="w-full rounded-xl bg-background px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Líquido atual (R$)</label>
                  <input
                    inputMode="decimal"
                    value={form.current_net_value}
                    onChange={(e) => setForm({ ...form, current_net_value: e.target.value })}
                    placeholder="0,00"
                    className="w-full rounded-xl bg-background px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Preenchendo o valor bruto, o Cofre360 calcula automaticamente lucro e rentabilidade sobre o aporte.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Risco</label>
                <input
                  value={form.risk_level}
                  onChange={(e) => setForm({ ...form, risk_level: e.target.value })}
                  placeholder="Baixo, Médio, Alto"
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Nota de risco</label>
                <input
                  inputMode="decimal"
                  value={form.risk_score}
                  onChange={(e) => setForm({ ...form, risk_score: e.target.value })}
                  placeholder="Ex: 24"
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Cotização de resgate</label>
                <input
                  value={form.redemption_quote}
                  onChange={(e) => setForm({ ...form, redemption_quote: e.target.value })}
                  placeholder="Ex: D+1"
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Liquidação</label>
                <input
                  value={form.redemption_settlement}
                  onChange={(e) => setForm({ ...form, redemption_settlement: e.target.value })}
                  placeholder="Ex: D+2 úteis"
                  className="w-full rounded-xl bg-card px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Data de compra</label>''',
'manual valuation form',
)

# Add a compact net value / profit line to each asset card.
replace_once(
'''                  <div className="flex items-center justify-end gap-0.5">
                    {positive ? (
                      <TrendingUp className="h-2.5 w-2.5 text-primary" />
                    ) : (
                      <TrendingDown className="h-2.5 w-2.5 text-destructive" />
                    )}
                    <span className={`text-[10px] font-medium tabular-nums ${positive ? "text-primary" : "text-destructive"}`}>
                      {positive ? "+" : ""}{val.pctChange.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                    </span>
                  </div>''',
'''                  <div className="flex items-center justify-end gap-0.5">
                    {positive ? (
                      <TrendingUp className="h-2.5 w-2.5 text-primary" />
                    ) : (
                      <TrendingDown className="h-2.5 w-2.5 text-destructive" />
                    )}
                    <span className={`text-[10px] font-medium tabular-nums ${positive ? "text-primary" : "text-destructive"}`}>
                      {positive ? "+" : ""}{fmtBRL(val.grossPnL)} · {positive ? "+" : ""}{val.pctChange.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                    </span>
                  </div>
                  {inv.current_net_value != null && (
                    <p className="text-[9px] text-muted-foreground tabular-nums">Líquido {fmtBRL(val.netValue)}</p>
                  )}''',
'asset card calculated values',
)

p.write_text(s, encoding='utf-8')
