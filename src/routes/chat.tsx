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
    <div className="animate-page-enter flex h-[calc(100vh-5rem)] flex-col px-4 pt-6 pb-4">
      <FinancialChat />
    </div>
  );
}

