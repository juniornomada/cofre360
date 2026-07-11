import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/goals")({
  beforeLoad: () => {
    throw redirect({ to: "/orcametas", search: { tab: "goals" } });
  },
});
