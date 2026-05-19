import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/budget")({
  beforeLoad: () => {
    throw redirect({ to: "/orcametas" });
  },
});
