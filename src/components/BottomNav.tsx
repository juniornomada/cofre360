import { useLocation, useRouterState } from "@tanstack/react-router";
import { SmartLink as Link } from "./SmartLink";
import { Home, ArrowLeftRight, Sparkles, Target, User } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/" as const, icon: Home, label: "Início" },
  { to: "/transactions" as const, icon: ArrowLeftRight, label: "Transações" },
  { to: "/orcametas" as const, icon: Target, label: "OrçaMetas" },
  { to: "/insights" as const, icon: Sparkles, label: "Insights IA" },
  { to: "/profile" as const, icon: User, label: "Perfil" },
];


export function BottomNav() {
  const location = useLocation();
  const isLoading = useRouterState({ select: (s) => s.status === 'pending' });
  const pendingLocation = useRouterState({ select: (s) => s.location });

  return (
    <nav 
      data-test="bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/80 backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-between px-6 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {navItems.map((item) => {
          const isPending = isLoading && pendingLocation?.pathname === item.to;
          const isActive = (location.pathname === item.to && !isLoading) || isPending;

          return (
            <Link
              key={item.to}
              to={item.to}
              search={{} as any}
              preload="intent"
              data-test="nav-icon"
              aria-current={isActive ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              className={cn(
                "nav-item-transition flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] shrink-0 min-w-[3rem] min-h-[3rem] justify-center transition-all duration-200",
                isActive
                  ? "text-primary bg-primary/10 shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <item.icon
                className={cn(
                  "h-6 w-6 transition-transform duration-200",
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
                <span className="absolute -bottom-1 h-1 w-1 rounded-full bg-primary animate-scale-in" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

