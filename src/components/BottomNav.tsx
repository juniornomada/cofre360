import { useLocation, useRouterState } from "@tanstack/react-router";
import { SmartLink as Link } from "./SmartLink";
import { Home, ArrowLeftRight, Landmark, CreditCard, Sparkles, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/" as const, icon: Home, label: "Início" },
  { to: "/transactions" as const, icon: ArrowLeftRight, label: "Transações" },
  { to: "/accounts" as const, icon: Landmark, label: "Contas" },
  { to: "/cards" as const, icon: CreditCard, label: "Cartões" },
  { to: "/orcametas" as const, icon: Target, label: "OrçaMetas" },
  { to: "/insights" as const, icon: Sparkles, label: "Insights IA" },
];

export function BottomNav() {
  const location = useLocation();
  const isLoading = useRouterState({ select: (s) => s.status === 'pending' });
  const pendingLocation = useRouterState({ select: (s) => s.location });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.05] bg-card/40 backdrop-blur-3xl">
      <div className="mx-auto flex w-full max-w-lg items-center justify-around px-4 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] overflow-x-auto no-scrollbar sm:justify-center sm:gap-6">
        {navItems.map((item) => {
          const isPending = isLoading && pendingLocation?.pathname === item.to;
          const isActive = (location.pathname === item.to && !isLoading) || isPending;
          const shouldHighlight = isActive;
          
          return (
            <Link
              key={item.to}
              to={item.to}
              search={{} as any}
              preload="intent"
              className={cn(
                "nav-item-transition flex flex-col items-center gap-1.5 rounded-2xl px-2 py-2 text-[10px] shrink-0 min-w-[4rem] transition-all duration-300",
                shouldHighlight
                  ? "text-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 transition-all duration-300",
                  shouldHighlight && "stroke-[2.5] scale-110 drop-shadow-[0_0_8px_oklch(from_var(--color-primary)_l_c_h_/_0.3)]"
                )}
              />
              <span className={cn(
                "font-medium transition-all duration-300 tracking-tight",
                shouldHighlight && "font-bold text-primary"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
