import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Barra inferior — pré-carregamento no Android", () => {
  const nav = readFileSync(resolve(process.cwd(), "src/components/BottomNav.tsx"), "utf8");
  const smart = readFileSync(resolve(process.cwd(), "src/components/SmartLink.tsx"), "utf8");

  it("usa Link nativo em vez do pré-carregamento de viewport do SmartLink", () => {
    expect(nav).toContain('import { Link } from "@tanstack/react-router"');
    expect(nav).not.toContain('SmartLink as Link');
    expect(nav).toContain('preload="intent"');
    expect(smart).toContain("IntersectionObserver");
    expect(smart).toContain("router.preloadRoute(");
  });

  it("mantém todos os destinos da navegação sem alterar páginas financeiras", () => {
    for (const destination of ["/home", "/transactions", "/accounts", "/cards", "/invest", "/insights"]) {
      expect(nav).toContain('to: "' + destination + '"');
    }
    expect(nav).toContain("useRouterState");
    expect(nav).toContain("pendingLocation");
    expect(nav).toContain("isActive");
  });
});
