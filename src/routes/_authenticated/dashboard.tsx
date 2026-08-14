import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Receipt, ShoppingBag, Truck, AlertTriangle, Users, FileWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { formatDateTime, formatMoney, todayISO } from "@/lib/format";
import { PageHeader, SectionCard, StatCard, StatusBadge, EmptyState } from "@/components/erp/ui";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Flower Industries Flower Shop ERP" },
      { name: "description", content: "Today's sales, orders, deliveries and stock alerts at a glance." },
      { property: "og:title", content: "Dashboard — Flower Industries Flower Shop ERP" },
      { property: "og:description", content: "Daily overview of the flower shop's sales and operations." },
    ],
  }),
  component: Dashboard,
});

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function Dashboard() {
  const { currency } = useSettings();
  const today = todayISO();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", today],
    queryFn: async () => {
      const monthStart = today.slice(0, 8) + "01";
      const weekStart = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);

      const [invoices, orders, deliveries, items, customers, invoiceItems] = await Promise.all([
        supabase.from("invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("orders").select("*").order("created_at", { ascending: false }),
        supabase.from("deliveries").select("*"),
        supabase.from("inventory_items").select("*"),
        supabase.from("customers").select("id"),
        supabase.from("invoice_items").select("description,quantity,invoice_id,created_at"),
      ]);

      const inv = invoices.data ?? [];
      const ord = orders.data ?? [];

      const todaySales = inv
        .filter((i) => i.issue_date === today && i.status !== "Draft")
        .reduce((s, i) => s + Number(i.total), 0);

      const salesByDay: { day: string; total: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
        salesByDay.push({
          day: new Date(d).toLocaleDateString(undefined, { weekday: "short" }),
          total: inv
            .filter((x) => x.issue_date === d && x.status !== "Draft")
            .reduce((s, x) => s + Number(x.total), 0),
        });
      }

      const monthInvoiceIds = new Set(
        inv.filter((i) => i.issue_date >= monthStart).map((i) => i.id),
      );
      const productTotals = new Map<string, number>();
      for (const li of invoiceItems.data ?? []) {
        if (!monthInvoiceIds.has(li.invoice_id)) continue;
        productTotals.set(
          li.description,
          (productTotals.get(li.description) ?? 0) + Number(li.quantity),
        );
      }
      const topProducts = [...productTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, value]) => ({ name, value }));

      return {
        todaySales,
        todayOrders: ord.filter((o) => o.created_at.slice(0, 10) === today).length,
        pendingDeliveries: (deliveries.data ?? []).filter(
          (d) => d.status === "Pending" || d.status === "Out for Delivery",
        ).length,
        lowStock: (items.data ?? []).filter(
          (i) => Number(i.current_stock) <= Number(i.reorder_level),
        ).length,
        totalCustomers: (customers.data ?? []).length,
        outstanding: inv
          .filter((i) => i.status !== "Draft")
          .reduce((s, i) => s + Math.max(0, Number(i.total) - Number(i.amount_paid)), 0),
        salesByDay,
        topProducts,
        weekStart,
        recent: [
          ...inv.slice(0, 10).map((i) => ({
            id: i.id,
            kind: "Invoice" as const,
            label: i.invoice_number,
            status: i.status,
            amount: Number(i.total),
            at: i.created_at,
          })),
          ...ord.slice(0, 10).map((o) => ({
            id: o.id,
            kind: "Order" as const,
            label: o.order_number,
            status: o.status,
            amount: Number(o.total),
            at: o.created_at,
          })),
        ]
          .sort((a, b) => (a.at < b.at ? 1 : -1))
          .slice(0, 10),
      };
    },
  });

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="A live snapshot of today's shop floor." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Today's Sales"
          value={formatMoney(data?.todaySales ?? 0, currency)}
          icon={<Receipt className="size-4" />}
        />
        <StatCard label="Today's Orders" value={data?.todayOrders ?? 0} icon={<ShoppingBag className="size-4" />} />
        <StatCard
          label="Pending Deliveries"
          value={data?.pendingDeliveries ?? 0}
          icon={<Truck className="size-4" />}
          tone={(data?.pendingDeliveries ?? 0) > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Low Stock Alerts"
          value={data?.lowStock ?? 0}
          icon={<AlertTriangle className="size-4" />}
          tone={(data?.lowStock ?? 0) > 0 ? "danger" : "success"}
        />
        <StatCard label="Total Customers" value={data?.totalCustomers ?? 0} icon={<Users className="size-4" />} />
        <StatCard
          label="Outstanding Invoices"
          value={formatMoney(data?.outstanding ?? 0, currency)}
          icon={<FileWarning className="size-4" />}
          tone={(data?.outstanding ?? 0) > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <SectionCard title="Sales — last 7 days" className="lg:col-span-3">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.salesByDay ?? []}>
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={70} />
                <Tooltip
                  formatter={(v: number) => formatMoney(v, currency)}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="total" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Top 5 products this month" className="lg:col-span-2">
          <div className="h-64">
            {data?.topProducts?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.topProducts} dataKey="value" nameKey="name" outerRadius={80}>
                    {data.topProducts.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No invoiced items yet this month." />
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Recent activity" className="mt-6">
        {isLoading ? (
          <EmptyState message="Loading…" />
        ) : data?.recent.length ? (
          <ul className="divide-y divide-border">
            {data.recent.map((r) => (
              <li key={r.kind + r.id} className="flex items-center gap-3 py-2.5 text-sm">
                <Link
                  to={r.kind === "Invoice" ? "/invoices/$id" : "/orders/$id"}
                  params={{ id: r.id }}
                  className="font-medium text-primary hover:underline"
                >
                  {r.label}
                </Link>
                <span className="text-muted-foreground">{r.kind}</span>
                <StatusBadge status={r.status} />
                <span className="ml-auto hidden text-muted-foreground sm:block">
                  {formatDateTime(r.at)}
                </span>
                <span className="font-medium">{formatMoney(r.amount, currency)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState message="No orders or invoices yet." />
        )}
      </SectionCard>
    </div>
  );
}
