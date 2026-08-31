import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_shell/inward")({
  beforeLoad: () => {
    throw redirect({ to: "/labels" });
  },
  component: () => null,
});
