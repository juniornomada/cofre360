from pathlib import Path

voice = Path("src/lib/voice-transaction.ts")
s = voice.read_text(encoding="utf-8")

old = "  card: string | null;\n  installmentCount: number | null;"
new = "  card: string | null;\n  bankAccount: string | null;\n  installmentCount: number | null;"
if old not in s:
    raise SystemExit("voice draft type anchor not found")
s = s.replace(old, new, 1)

# The previous pattern accepted only 3-digit groups after a dot first, so
# "1.06" was captured as "1". Require at least one full thousands group in
# that branch, then let ordinary 1-2 decimal digits use the second branch.
old_money = r"\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?"
new_money = r"\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?"
count = s.count(old_money)
if count < 6:
    raise SystemExit(f"unexpected money pattern count: {count}")
s = s.replace(old_money, new_money)

old_boundary = r"const METADATA_BOUNDARY = String.raw`(?:no\s+valor\b|valor\b|por\s+(?:r\$|\d)|cart[aã]o\b|categoria\b|em\s+(?:\d+|${NUMBER_WORD_TOKEN})\s*(?:x|parcelas?)\b|hoje\b|ontem\b|anteontem\b|data\b|dia\s+\d)`;"
new_boundary = r"const METADATA_BOUNDARY = String.raw`(?:no\s+valor\b|valor\b|por\s+(?:r\$|\d)|cart[aã]o\b|conta(?:\s+banc[aá]ria)?\b|categoria\b|em\s+(?:\d+|${NUMBER_WORD_TOKEN})\s*(?:x|parcelas?)\b|hoje\b|ontem\b|anteontem\b|data\b|dia\s+\d)`;"
if old_boundary not in s:
    raise SystemExit("metadata boundary anchor not found")
s = s.replace(old_boundary, new_boundary, 1)

anchor = "function parseInstallments(text: string): number | null {"
bank_parser = r'''function parseBankAccount(text: string): string | null {
  const match = text.match(new RegExp(
    `\\bconta(?:\\s+banc[aá]ria)?\\s+(?:(?:do|da|de)\\s+)?(.+?)(?=\\s+(?:${METADATA_BOUNDARY})|[,.]|$)`,
    "i",
  ));
  if (!match) return null;
  const account = match[1].trim().replace(/[,.]+$/, "");
  return account && account.length <= 80 ? account : null;
}

function parseInstallments(text: string): number | null {'''
if anchor not in s:
    raise SystemExit("installment parser anchor not found")
s = s.replace(anchor, bank_parser, 1)

old_intent = r"/\b(?:gastei|paguei|comprei|adquiri|recebi|ganhei|lancei|registrei|adicionei)\b\s+(.+)$/i"
new_intent = r"/\b(?:gastei|paguei|comprei|adquiri|recebi|ganhei|lancei|registrei|adicionei|lance|registre|adicione)\b\s+(.+)$/i"
if old_intent not in s:
    raise SystemExit("voice intent anchor not found")
s = s.replace(old_intent, new_intent, 1)

old_type = '''  const type: VoiceTransactionType = /\\b(recebi|ganhei|entrou|caiu|receita|salario|reembolso)\\b/.test(normalized)
    ? "income"
    : "expense";'''
new_type = '''  const isYield = /\\b(rendimentos?|juros?|rentabilidade)\\b/.test(normalized);
  const type: VoiceTransactionType = isYield || /\\b(recebi|ganhei|entrou|caiu|receita|salario|reembolso)\\b/.test(normalized)
    ? "income"
    : "expense";'''
if old_type not in s:
    raise SystemExit("voice type anchor not found")
s = s.replace(old_type, new_type, 1)

old_name = '''  const spokenCategory = spokenCategoryMatch?.[1]?.trim() || null;
  const name = extractName(transcript);
  const inferred = inferCategory(name, spokenCategory, type);'''
new_name = '''  const spokenCategory = spokenCategoryMatch?.[1]?.trim() || null;
  const name = isYield ? "Rendimento" : extractName(transcript);
  const inferred = isYield
    ? { category: "Receita > Juros", icon: "📈" }
    : inferCategory(name, spokenCategory, type);'''
if old_name not in s:
    raise SystemExit("yield name/category anchor not found")
s = s.replace(old_name, new_name, 1)

old_return = '''    icon: inferred.icon,
    card: parseCard(transcript),
    installmentCount: parseInstallments(transcript),'''
new_return = '''    icon: inferred.icon,
    card: parseCard(transcript),
    bankAccount: parseBankAccount(transcript),
    installmentCount: parseInstallments(transcript),'''
if old_return not in s:
    raise SystemExit("voice return anchor not found")
s = s.replace(old_return, new_return, 1)

old_fallback = '''      if (/\\d+\\s*(?:x|parcelas?)\\b/i.test(around)) continue;
      if (/\\d{1,2}[\\/-]\\d{1,2}/.test(around)) continue;
      return moneyToNumber(raw);'''
new_fallback = '''      if (/\\d+\\s*(?:x|parcelas?)\\b/i.test(around)) continue;
      if (/\\d{1,2}[\\/-]\\d{1,2}/.test(around)) continue;
      if (/^\\s*%/.test(text.slice(index + raw.length, index + raw.length + 3))) continue;
      return moneyToNumber(raw);'''
if old_fallback not in s:
    raise SystemExit("fallback amount anchor not found")
s = s.replace(old_fallback, new_fallback, 1)
voice.write_text(s, encoding="utf-8")

quick = Path("src/components/QuickAddTransactionDialog.tsx")
q = quick.read_text(encoding="utf-8")
card_effect = '''  useEffect(() => {
    if (!open || !initialDraft?.card || cardOptions.length === 0) return;
    const spoken = initialDraft.card.trim().toLowerCase();
    const match = cardOptions.find(card => card.name.trim().toLowerCase() === spoken);
    if (!match || newTx.card === match.name) return;
    setNewTx(prev => ({ ...prev, card: match.name, bank_account_id: null }));
  }, [open, initialDraft?.card, cardOptions, newTx.card]);
'''
account_effect = card_effect + '''
  useEffect(() => {
    if (!open || !initialDraft?.bankAccount || bankAccounts.length === 0) return;
    const normalizeAccountName = (value: string) => value
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .toLowerCase()
      .replace(/\\bpor cento\\b/g, "%")
      .replace(/\\s*%\\s*/g, "%")
      .replace(/\\s+/g, " ")
      .trim();
    const spoken = normalizeAccountName(initialDraft.bankAccount);
    const match = bankAccounts.find(account => normalizeAccountName(account.name) === spoken);
    if (!match || newTx.bank_account_id === match.id) return;
    setNewTx(prev => ({ ...prev, bank_account_id: match.id, card: null }));
  }, [open, initialDraft?.bankAccount, bankAccounts, newTx.bank_account_id]);
'''
if card_effect not in q:
    raise SystemExit("QuickAdd card effect anchor not found")
quick.write_text(q.replace(card_effect, account_effect, 1), encoding="utf-8")

test = Path("src/lib/__tests__/voice-transaction.test.ts")
t = test.read_text(encoding="utf-8")
marker = "\n});\n"
idx = t.rfind(marker)
if idx < 0:
    raise SystemExit("voice test closing marker not found")
regression = '''

  it("entende rendimento, conta com percentual e valor decimal com ponto", () => {
    const draft = parseVoiceTransaction(
      "Lance um rendimento na conta Cofrinho 140% no valor de 1.06",
      now,
    );

    expect(draft.type).toBe("income");
    expect(draft.name).toBe("Rendimento");
    expect(draft.category).toBe("Receita > Juros");
    expect(draft.icon).toBe("📈");
    expect(draft.bankAccount).toBe("Cofrinho 140%");
    expect(draft.card).toBeNull();
    expect(draft.amount).toBe(1.06);
  });'''
test.write_text(t[:idx] + regression + t[idx:], encoding="utf-8")
