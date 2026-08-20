import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Gauge, Menu, PackageCheck, ScanLine, Warehouse } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNav } from "@/components/layout/AppSidebar";
import { BrandMark } from "@/components/layout/BrandMark";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const item = (to: string, label: string, Icon: typeof Gauge) => {
    const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
    return (
      <Link
        key={to}
        to={to}
        className={cn(
          "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
        {label}
      </Link>
    );
  };

  return (
    <div
      data-testid="mobile-navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
    >
      <div className="flex items-end">
        {item("/", "Home", Gauge)}
        {item("/inward", "Inward", PackageCheck)}
        <Link
          to="/issue"
          className="brand-gradient -mt-5 flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl text-primary-foreground shadow-[var(--shadow-float)]"
        >
          <ScanLine className="h-6 w-6" />
          <span className="text-[9px] font-semibold">Scan</span>
        </Link>
        {item("/inventory", "Stock", Warehouse)}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium text-muted-foreground">
            <Menu className="h-5 w-5" />
            Menu
          </SheetTrigger>
          <SheetContent side="right" className="w-72 bg-sidebar p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex h-16 items-center border-b border-sidebar-border px-4">
              <BrandMark />
            </div>
            <SidebarNav onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
