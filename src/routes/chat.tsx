import { createFileRoute } from "@tanstack/react-router";
import { FinancialChat } from "@/components/FinancialChat";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat — Cofre 360" },
      { name: "description", content: "Converse com seu assistente financeiro" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  return (
    <div className="app-container h-[calc(100vh-5rem)]">
      <FinancialChat />
    </div>
  );
}

