import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, CircleHelp, LogOut, Menu, Search, Settings, UserRound } from "lucide-react";
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
import { getDashboardData, getStoredUser, logout } from "@/services/api";
import { useBranding } from "@/hooks/use-branding";

export function TopHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { data: dashboard } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboardData,
    staleTime: 30_000,
  });
  const notifications = (dashboard?.activity ?? []).slice(0, 3);
  const currentUser = getStoredUser();
  const { branding } = useBranding();
  const displayName = currentUser?.fullName ?? "TrackGRN User";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const q = globalSearch.trim();
    if (q) void navigate({ to: "/traceability", search: { q } });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur sm:px-4">
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

      <form
        onSubmit={submitSearch}
        className="relative hidden max-w-md flex-1 md:block"
        role="search"
      >
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={globalSearch}
          onChange={(event) => setGlobalSearch(event.target.value)}
          placeholder="Search GRN, material, label UID…"
          aria-label="Global traceability search"
          className="h-9 pl-9"
        />
        <kbd className="absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground lg:block">
          Ctrl K
        </kbd>
      </form>

      <div className="flex flex-1 items-center justify-end gap-1 sm:gap-2">
        {branding.clientLogoDataUrl || branding.clientName ? (
          <div
            className="hidden h-9 max-w-48 items-center gap-2 rounded-lg border border-border bg-surface px-2 sm:flex"
            aria-label="Configured client"
          >
            {branding.clientLogoDataUrl ? (
              <img
                src={branding.clientLogoDataUrl}
                alt={branding.clientName ? `${branding.clientName} logo` : "Client logo"}
                className="h-7 max-w-20 object-contain"
              />
            ) : null}
            {branding.clientName ? (
              <span className="truncate text-[11px] font-semibold">{branding.clientName}</span>
            ) : null}
          </div>
        ) : null}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="h-[1.15rem] w-[1.15rem]" />
              {notifications.length > 0 ? (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">
              Notifications
            </div>
            <ul>
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className="border-b border-border/70 px-4 py-3 last:border-0 hover:bg-accent/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{notification.text}</p>
                    <StatusBadge status={notification.type} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {notification.user} · {notification.time}
                  </p>
                </li>
              ))}
              {notifications.length === 0 ? (
                <li className="px-4 py-5 text-center text-xs text-muted-foreground">
                  No recent material activity
                </li>
              ) : null}
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
            <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2" aria-label="User menu">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/15 text-xs font-semibold text-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-xs font-semibold">{displayName}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {currentUser?.roleDisplay ?? "Authenticated"}
                </span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="text-sm">{displayName}</p>
              <p className="num text-xs font-normal text-muted-foreground">
                {currentUser?.employeeCode ?? "—"}
              </p>
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
            <DropdownMenuItem
              onSelect={() => {
                void logout().finally(() => navigate({ to: "/login" }));
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
