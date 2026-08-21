import { Link, useRouterState } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { BrandMark } from "@/components/layout/BrandMark";
import { navGroups, navItems } from "@/components/layout/nav";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      data-testid="sidebar-scroll"
      className="flex min-h-0 flex-1 touch-pan-y flex-col gap-5 overflow-y-auto overscroll-contain px-2 py-4 [scrollbar-gutter:stable]"
    >
      {navGroups.map((group) => (
        <div key={group}>
          {!collapsed ? (
            <p className="mb-1.5 px-3 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
              {group}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {navItems
              .filter((i) => i.group === group)
              .map((item) => {
                const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                const link = (
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    {active ? (
                      <span className="brand-gradient absolute top-1.5 bottom-1.5 left-0 w-1 rounded-r-full" />
                    ) : null}
                    <item.icon className={cn("h-4.5 w-4.5 shrink-0", active && "text-primary")} />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </Link>
                );
                return (
                  <li key={item.to}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        "hidden h-dvh shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-sidebar-border px-4",
          collapsed && "justify-center px-2",
        )}
      >
        <BrandMark collapsed={collapsed} />
      </div>
      <SidebarNav collapsed={collapsed} />
      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center gap-2"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
          {!collapsed ? "Collapse" : null}
        </Button>
      </div>
    </aside>
  );
}
