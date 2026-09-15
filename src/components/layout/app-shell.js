"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  ShoppingBasket,
  ReceiptText,
  Package,
  WalletCards,
  PanelLeftClose,
  PanelLeftOpen,
  ChartNoAxesCombined,
  CalendarCheck,
  Users,
  ContactRound,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { api } from "@/lib/client";
import NetworkStatus from "@/components/offline/network-status";
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
const navigation = [
  {
    label: "Workspace",
    items: [
      ["Dashboard", "/dashboard", LayoutDashboard],
      ["Sales", "/sales", ReceiptText],
      ["Products", "/products", Package],
      ["Customers", "/customers", ContactRound],
    ],
  },
  {
    label: "Finance",
    items: [
      ["Expenses", "/expenses", WalletCards],
      ["Reports", "/reports", ChartNoAxesCombined],
      ["Day Closing", "/day-closing", CalendarCheck],
    ],
  },
  {
    label: "Management",
    items: [
      ["Users", "/users", Users],
      ["Settings", "/settings", Settings],
    ],
  },
];
const links = [
  ["New Sale", "/pos", ShoppingBasket],
  ...navigation.flatMap((group) => group.items),
];
const isActive = (pathname, href) =>
  pathname === href || pathname.startsWith(`${href}/`);
export default function AppShell({ user, settings, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const sidebarRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const sidebar = sidebarRef.current;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.querySelector("a, button")?.focus();
    function keydown(event) {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab") return;
      const controls = [
        ...sidebar.querySelectorAll("a, button:not(:disabled)"),
      ].filter((element) => element.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    const media = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (media.matches) setOpen(false);
    };
    document.addEventListener("keydown", keydown);
    media.addEventListener("change", closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      media.removeEventListener("change", closeOnDesktop);
      trigger?.focus();
    };
  }, [open]);
  const permitted = ([, path]) =>
    user.role === "ADMIN" ||
    ["/pos", "/sales"].includes(path) ||
    (path === "/expenses" && settings.allowCashierExpenses) ||
    (path === "/day-closing" && settings.allowCashierDayClosing);
  const groups = navigation
    .map((group) => ({ ...group, items: group.items.filter(permitted) }))
    .filter((group) => group.items.length);
  async function logout() {
    setPending(true);
    try {
      await api("/auth/logout", { method: "POST", body: {} });
      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast.error(error.message);
      setPending(false);
    }
  }
  const title =
    links.find(([, path]) => isActive(pathname, path))?.[0] || "Karikku POS";
  return (
    <AuthContext.Provider value={{ user, settings }}>
      <Toaster richColors position="top-right" />
      <div className={`pos-app ${expanded ? "sidebar-expanded" : ""}`}>
        <aside
          id="shop-navigation"
          ref={sidebarRef}
          aria-label="Shop navigation"
          role={open ? "dialog" : undefined}
          aria-modal={open ? true : undefined}
          className={`sidebar ${open ? "sidebar-open" : ""}`}
        >
          <Link
            className="brand brand-with-logo"
            href={user.role === "ADMIN" ? "/dashboard" : "/pos"}
            onClick={() => setOpen(false)}
          >
            <Image
              src="/logo.png"
              alt="Karikku Juice Shop"
              width={108}
              height={108}
              className="app-brand-logo"
              priority
            />
          </Link>
          <button
            className="icon-button close-nav"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
          <Link
            href="/pos"
            className="new-sale-action"
            aria-label="New Sale"
            title="New Sale"
            aria-current={isActive(pathname, "/pos") ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            <ShoppingBasket size={20} aria-hidden="true" />
            <span className="nav-label">New Sale</span>
          </Link>
          <nav aria-label="Main navigation">
            {groups.map((group) => (
              <div className="nav-group" key={group.label}>
                <h2 className="nav-group-heading">{group.label}</h2>
                {group.items.map(([label, href, Icon]) => (
                  <Link
                    key={href}
                    href={href}
                    className={isActive(pathname, href) ? "selected" : ""}
                    aria-current={isActive(pathname, href) ? "page" : undefined}
                    aria-label={label}
                    title={label}
                    onClick={() => setOpen(false)}
                  >
                    <Icon size={19} aria-hidden="true" />
                    <span className="nav-label">{label}</span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-footer">
            <button
              className="logout"
              aria-label={pending ? "Signing out" : "Logout"}
              title="Logout"
              disabled={pending}
              onClick={logout}
            >
              <LogOut size={19} />
              <span className="nav-label">
                {pending ? "Signing out…" : "Logout"}
              </span>
            </button>
            <small className="sidebar-caption">Karikku Juice POS</small>
          </div>
        </aside>
        {open && (
          <button
            className="nav-scrim"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
        )}
        <div className="app-content" inert={open ? true : undefined}>
          <header className="app-header">
            <button
              className="icon-button mobile-nav"
              ref={triggerRef}
              aria-label="Open navigation"
              aria-expanded={open}
              aria-controls="shop-navigation"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </button>
            <button
              className="icon-button tablet-nav"
              aria-label={
                expanded ? "Collapse navigation" : "Expand navigation"
              }
              aria-expanded={expanded}
              aria-controls="shop-navigation"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? (
                <PanelLeftClose size={20} />
              ) : (
                <PanelLeftOpen size={20} />
              )}
            </button>
            <strong>{pathname === "/pos" ? "Point of Sale" : title}</strong>
            <NetworkStatus />
            <div className="current-user">
              <span>
                {user.name}
                <small>
                  {user.role === "ADMIN" ? "Administrator" : "Cashier"}
                </small>
              </span>
              <span className="avatar">{user.name.slice(0, 1)}</span>
            </div>
          </header>
          <div className="app-page">{children}</div>
        </div>
      </div>
    </AuthContext.Provider>
  );
}
