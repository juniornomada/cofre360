from pathlib import Path

calc_path = Path("src/components/CalculatorAmountInput.tsx")
quick_path = Path("src/components/QuickAddTransactionDialog.tsx")

calc = calc_path.read_text()
quick = quick_path.read_text()

replacements_calc = [
    (
        '  /** Optional callback when Enter is pressed */\n  onEnter?: () => void;\n}',
        '  /** Optional callback when Enter is pressed */\n  onEnter?: () => void;\n  /** Show zero as an empty field. Intended for new transaction forms. */\n  blankWhenZero?: boolean;\n}',
    ),
    (
        'export function CalculatorAmountInput({ value, onChange, tone, className, autoFocus, onEnter }: Props) {\n  const [focused, setFocused] = useState(false);\n  const [draft, setDraft] = useState(() => toEditableValue(value));',
        'export function CalculatorAmountInput({ value, onChange, tone, className, autoFocus, onEnter, blankWhenZero = false }: Props) {\n  const [focused, setFocused] = useState(false);\n  const [draft, setDraft] = useState(() =>\n    blankWhenZero && Number(value || 0) === 0 ? "" : toEditableValue(value)\n  );',
    ),
    (
        '  useEffect(() => {\n    if (!focused) setDraft(toEditableValue(value));\n  }, [value, focused]);',
        '  useEffect(() => {\n    if (!focused) {\n      setDraft(blankWhenZero && Number(value || 0) === 0 ? "" : toEditableValue(value));\n    }\n  }, [value, focused, blankWhenZero]);',
    ),
    (
        '  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {\n    setFocused(true);\n    setDraft(toEditableValue(value));',
        '  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {\n    setFocused(true);\n    setDraft(blankWhenZero && Number(value || 0) === 0 ? "" : toEditableValue(value));',
    ),
    (
        '  const handleBlur = () => {\n    setFocused(false);\n    setDraft(toEditableValue(value));\n  };',
        '  const handleBlur = () => {\n    setFocused(false);\n    setDraft(blankWhenZero && Number(value || 0) === 0 ? "" : toEditableValue(value));\n  };',
    ),
    (
        '  const formattedValue = formatCurrency(value);',
        '  const formattedValue = blankWhenZero && Number(value || 0) === 0 ? "" : formatCurrency(value);',
    ),
    (
        '        aria-label={`Valor: ${formattedValue}`}',
        '        aria-label={formattedValue ? `Valor: ${formattedValue}` : "Valor vazio"}',
    ),
]

for old, new in replacements_calc:
    if old not in calc:
        raise SystemExit(f"CalculatorAmountInput replacement not found:\n{old}")
    calc = calc.replace(old, new, 1)

replacements_quick = [
    (
        '     if (!open) {\n       setConfirmInstallmentDiff(false);\n       isFirstRender.current = true;\n       return;\n     }',
        '     if (!open) {\n       setConfirmInstallmentDiff(false);\n       setNewTx(prev => prev.amount === 0 ? prev : { ...prev, amount: 0 });\n       setInstallmentFixedValue(0);\n       isFirstRender.current = true;\n       return;\n     }',
    ),
    (
        '    // Restaurar preferências de parcelamento (modo/valor/N) da última abertura,\n',
        '    // Restaurar preferências de parcelamento (modo/N) da última abertura.\n    // O valor nunca é reaproveitado em uma nova transação.\n',
    ),
    (
        '      amount: copyData ? copyData.amount : (prefs?.amount ?? 0),',
        '      amount: 0,',
    ),
]

for old, new in replacements_quick:
    if old not in quick:
        raise SystemExit(f"QuickAdd replacement not found:\n{old}")
    quick = quick.replace(old, new, 1)

# The Quick Add dialog has exactly two primary amount fields: transfer and standard transaction.
needle = '                      tone="transfer"\n                    />'
replacement = '                      tone="transfer"\n                      blankWhenZero\n                    />'
if needle not in quick:
    raise SystemExit("Transfer amount input not found")
quick = quick.replace(needle, replacement, 1)

needle = '                      tone={newTx.type}\n                    />'
replacement = '                      tone={newTx.type}\n                      blankWhenZero\n                    />'
if needle not in quick:
    raise SystemExit("Standard amount input not found")
quick = quick.replace(needle, replacement, 1)

calc_path.write_text(calc)
quick_path.write_text(quick)

print("Applied blank-new-transaction amount behavior")
