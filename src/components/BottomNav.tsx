import { useLocation, useRouterState } from "@tanstack/react-router";
import { SmartLink as Link } from "./SmartLink";
import { Home, ArrowLeftRight, Landmark, CreditCard, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/home" as const, icon: Home, label: "Início" },
  { to: "/transactions" as const, icon: ArrowLeftRight, label: "Transações" },
  { to: "/accounts" as const, icon: Landmark, label: "Contas" },
  { to: "/cards" as const, icon: CreditCard, label: "Cartões" },
  { to: "/invest" as const, icon: TrendingUp, label: "Invest" },
  { to: "/insights" as const, icon: Sparkles, label: "Insights IA" },
];

export function BottomNav() {
  const location = useLocation();
  const isLoading = useRouterState({ select: (s) => s.status === 'pending' });
  const pendingLocation = useRouterState({ select: (s) => s.location });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center justify-around px-0.5 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] overflow-x-auto no-scrollbar">
        {navItems.map((item) => {
          const isPending = isLoading && pendingLocation?.pathname === item.to;
          const isActive = (location.pathname === item.to && !isLoading) || isPending;
          return (
            <Link
              key={item.to}
              to={item.to}
              search={{} as any}
              preload="intent"
              className={cn(
                "nav-item-transition flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-2 text-[9px] shrink-0 min-w-[3rem]",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 transition-transform duration-200",
                  isActive && "stroke-[2.5] scale-110"
                )}
              />
              <span className={cn(
                "font-medium transition-all duration-200 whitespace-nowrap",
                isActive && "font-semibold"
              )}>
                {item.label}
              </span>
              {isActive && (
                <span className="mt-0.5 h-1 w-1 rounded-full bg-primary animate-scale-in" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
