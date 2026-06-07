export type CardData = {
  id: string;
  name: string;
  last_four: string | number | null;
  brand: string;
  card_limit: number;
  used: number;
  color: string | null;
  emoji: string | null;
  closing_day: number | null;
  due_day: number | null;
  is_visible: boolean | null;
};

export type BankAccount = {
  id: string;
  name: string;
  balance: number;
  icon: string | null;
  color: string | null;
};

export type PaymentLine = {
  accountId: string;
  amount: string;
};
