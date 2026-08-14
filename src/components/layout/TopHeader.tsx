import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  CircleHelp,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SidebarNav } from "@/components/layout/AppSidebar";
import { BrandMark } from "@/components/layout/BrandMark";
import { StatusBadge } from "@/components/common/StatusBadge";
import { CURRENT_USER } from "@/mocks/data";

const notifications = [
  { id: "n1", title: "Import warning", body: "4 rows in IMP-20260814-004 need review", status: "Warning" },
  { id: "n2", title: "Revision rejected", body: "GRN 500515338 quantity below issued qty", status: "Rejected" },
  { id: "n3", title: "Labels ready", body: "42 labels generated for GRN 500515334", status: "Generated" },
];

export function TopHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur sm:px-4">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-16 items-center border-b border-sidebar-border px-4">
            <BrandMark />
          </div>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search GRN, material, label UID…" className="h-9 pl-9" />
        <kbd className="absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground lg:block">
          Ctrl K
        </kbd>
      </div>

      <div className="flex flex-1 items-center justify-end gap-1 sm:gap-2">
        <span className="hidden items-center gap-1.5 rounded-full border border-warning/35 bg-warning/12 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-warning uppercase sm:inline-flex">
          <ShieldCheck className="h-3.5 w-3.5" /> Demo
        </span>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="h-[1.15rem] w-[1.15rem]" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">Notifications</div>
            <ul>
              {notifications.map((n) => (
                <li key={n.id} className="border-b border-border/70 px-4 py-3 last:border-0 hover:bg-accent/40">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{n.title}</p>
                    <StatusBadge status={n.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>

        <Button variant="ghost" size="icon" aria-label="Help" asChild>
          <Link to="/reports">
            <CircleHelp className="h-[1.15rem] w-[1.15rem]" />
          </Link>
        </Button>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/12 text-xs font-semibold text-primary">RS</AvatarFallback>
              </Avatar>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-xs font-semibold">{CURRENT_USER.name}</span>
                <span className="block text-[10px] text-muted-foreground">{CURRENT_USER.role}</span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="text-sm">{CURRENT_USER.name}</p>
              <p className="num text-xs font-normal text-muted-foreground">{CURRENT_USER.employeeCode}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <UserRound className="mr-2 h-4 w-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/configuration">
                <Settings className="mr-2 h-4 w-4" /> Configuration
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/login">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
