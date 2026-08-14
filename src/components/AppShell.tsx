import { useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Receipt,
  FileText,
  Truck,
  Users,
  ShoppingBag,
  Boxes,
  Flower2,
  BookOpen,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/sales", label: "Daily Sales", icon: Receipt, ownerOnly: true },
  { to: "/invoices", label: "Invoicing", icon: FileText },
  { to: "/deliveries", label: "Deliveries", icon: Truck },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/orders", label: "Orders", icon: ShoppingBag },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/flowers", label: "Flower Management", icon: Flower2 },
  { to: "/help", label: "Help / Manual", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings, ownerOnly: true },
] as const;

export function AppShell() {
  const { displayName, role, isOwner, signOut } = useAuth();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = NAV.filter((n) => !("ownerOnly" in n && n.ownerOnly) || isOwner);

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2 border-b border-sidebar-border px-5 py-5">
          <Flower2 className="size-6 text-sidebar-primary" />
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold">
              {settings?.business_name ?? "Flower Industries"}
            </p>
            <p className="text-xs text-sidebar-foreground/60">Flower Shop ERP</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-[18px] shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-[18px]" /> Sign out
          </button>
        </div>
      </aside>

      {open && (
        <div
          className="no-print fixed inset-0 z-30 bg-foreground/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </Button>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium leading-tight">{displayName}</p>
              <p className="text-xs capitalize text-muted-foreground">{role ?? "staff"}</p>
            </div>
            <div className="grid size-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
