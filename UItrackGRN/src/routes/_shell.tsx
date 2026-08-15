import { useEffect, useState } from "react";
import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { isAuthenticated } from "@/services/api";

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      void navigate({ to: "/login" });
      return;
    }
    setAllowed(true);
  }, [navigate]);

  if (!allowed) return null;
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
