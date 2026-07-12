import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShoppingCart, Package, CheckCircle2, ArrowLeft, Trash2, CreditCard as CardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartLink as Link } from "@/components/SmartLink";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format-brl";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { sanitizeTransactionWrite } from "@/lib/normalize-transaction-name";

interface Product {
  id: string;
  name: string;
  price: number;
  icon: string;
  description: string;
}

const PRODUCTS: Product[] = [
  {
    id: "1",
    name: "Plano Premium Anual",
    price: 199.90,
    icon: "💎",
    description: "Acesso total a todos os recursos de IA e relatórios avançados."
  },
  {
    id: "2",
    name: "Créditos Extras de IA",
    price: 49.90,
    icon: "🤖",
    description: "Mais 500 consultas ao assistente financeiro IA."
  },
  {
    id: "3",
    name: "Suporte VIP",
    price: 29.90,
    icon: "🎧",
    description: "Atendimento prioritário 24/7."
  }
];

function ShopPage() {
  const [cart, setCart] = useState<Product[]>([]);
  const [step, setStep] = useState<"browsing" | "checkout" | "success">("browsing");
  const [isProcessing, setIsProcessing] = useState(false);

  const addToCart = (product: Product) => {
    setCart((prev) => [...prev, product]);
    toast.success(`${product.name} adicionado ao carrinho`);
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const total = cart.reduce((sum, item) => sum + item.price, 0);

  const handleCheckout = async () => {
    setIsProcessing(true);
    try {
      // Get a default bank account for the transaction
      const { data: accounts } = await supabase.from("bank_accounts").select("id").limit(1);
      const bankAccountId = accounts?.[0]?.id;

      if (!bankAccountId) {
        toast.error("Nenhuma conta bancária encontrada para processar o pagamento.");
        setIsProcessing(false);
        return;
      }

      const today = format(new Date(), "dd MMM", { locale: ptBR });

      // Create a transaction for each item or one for the total
      const { error } = await supabase.from("transactions").insert({
        name: `Compra: ${cart.map(item => item.name).join(", ")}`,
        amount: total,
        type: "expense",
        category: "Lazer > Outros", // Simplified
        date: today,
        bank_account_id: bankAccountId,
        icon: "🛍️"
      });

      if (error) throw error;

      setStep("success");
      setCart([]);
      toast.success("Compra realizada com sucesso!");
    } catch (error: any) {
      console.error("Erro no checkout:", error);
      toast.error("Erro ao processar pagamento.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (step === "success") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 px-4 py-20 text-center animate-page-enter">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/20">
          <CheckCircle2 className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pagamento Confirmado!</h1>
          <p className="mt-2 text-muted-foreground">Sua compra foi processada e já está disponível no seu histórico.</p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Link to="/transactions" className="w-full">
            <Button className="w-full rounded-xl">Ver Transações</Button>
          </Link>
          <Button variant="outline" className="rounded-xl" onClick={() => setStep("browsing")}>
            Voltar à Loja
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-page-enter flex flex-col gap-6 px-4 pt-6 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="interactive-button flex h-9 w-9 items-center justify-center rounded-xl bg-card">
            <ArrowLeft className="h-4 w-4 text-foreground" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">Loja Cofre 360</h1>
        </div>
        <div className="relative">
          <button 
            onClick={() => setStep("checkout")}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-card text-foreground"
          >
            <ShoppingCart className="h-5 w-5" />
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground animate-scale-in">
                {cart.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {step === "browsing" ? (
        <div className="grid gap-4">
          {PRODUCTS.map((product) => (
            <div key={product.id} className="interactive-card rounded-2xl bg-card p-4 flex flex-col gap-3">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-2xl">
                  {product.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">{product.name}</h3>
                  <p className="text-xs text-muted-foreground">{product.description}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-lg font-bold text-primary">R$ {formatBRL(product.price)}</span>
                <Button 
                  size="sm" 
                  className="rounded-lg"
                  onClick={() => addToCart(product)}
                >
                  Adicionar
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-4">Resumo do Pedido</h2>
            {cart.length === 0 ? (
              <p className="text-center py-6 text-sm text-muted-foreground">Seu carrinho está vazio.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {cart.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <span className="text-lg">{item.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">R$ {formatBRL(item.price)}</p>
                    </div>
                    <button onClick={() => removeFromCart(i)} className="text-destructive p-1">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 font-bold">
                  <span>Total</span>
                  <span className="text-primary">R$ {formatBRL(total)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-4">Método de Pagamento</h2>
            <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-primary bg-primary/5">
              <CardIcon className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Saldo em Conta</p>
                <p className="text-[10px] text-muted-foreground">O valor será debitado automaticamente</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button 
              className="w-full rounded-xl py-6 text-lg font-bold" 
              disabled={cart.length === 0 || isProcessing}
              onClick={handleCheckout}
            >
              {isProcessing ? "Processando..." : `Finalizar Compra - R$ ${formatBRL(total)}`}
            </Button>
            <Button variant="ghost" onClick={() => setStep("browsing")}>
              Continuar Comprando
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Loja — Cofre 360" },
      { name: "description", content: "Compre produtos e serviços" },
    ],
  }),
  component: ShopPage,
});
