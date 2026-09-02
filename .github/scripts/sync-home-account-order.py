from pathlib import Path

p = Path("src/routes/home.tsx")
text = p.read_text()

old_type = '''  parent_account_id: string | null;\n};'''
new_type = '''  parent_account_id: string | null;\n  sort_order: number | null;\n};'''
if old_type not in text:
    raise SystemExit("Account type marker not found")
text = text.replace(old_type, new_type, 1)

old_query = '''          supabase\n            .from("bank_accounts")\n            .select("id,name,icon,color,balance,is_visible,parent_account_id")\n            .eq("user_id", session.user.id),'''
new_query = '''          supabase\n            .from("bank_accounts")\n            .select("id,name,icon,color,balance,is_visible,parent_account_id,sort_order")\n            .eq("user_id", session.user.id)\n            .order("sort_order", { ascending: true })\n            .order("created_at", { ascending: true }),'''
if old_query not in text:
    raise SystemExit("Home bank account query marker not found")
text = text.replace(old_query, new_query, 1)

p.write_text(text)
print("Home now follows Accounts sort_order")
