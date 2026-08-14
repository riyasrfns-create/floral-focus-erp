import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { formatDate, formatMoney } from "@/lib/format";
import { PageHeader, SectionCard, StatCard, StatusBadge, EmptyState } from "@/components/erp/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/customers/$id")({
  head: () => ({
    meta: [
      { title: "Customer profile — Flower Industries Flower Shop ERP" },
      { name: "description", content: "Order history, lifetime spend and outstanding balance for a customer." },
      { property: "og:title", content: "Customer profile — Flower Industries Flower Shop ERP" },
      { property: "og:description", content: "Flower shop customer profile and purchase history." },
    ],
  }),
  component: CustomerProfile,
});

function CustomerProfile() {
  const { id } = Route.useParams();
  const { currency } = useSettings();

  const { data, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const [customer, orders, invoices] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).maybeSingle(),
        supabase.from("orders").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
        supabase.from("invoices").select("*").eq("customer_id", id).order("issue_date", { ascending: false }),
      ]);
      return {
        customer: customer.data,
        orders: orders.data ?? [],
        invoices: invoices.data ?? [],
      };
    },
  });

  if (isLoading) return <EmptyState message="Loading…" />;
  if (!data?.customer) return <EmptyState message="Customer not found." />;

  const c = data.customer;
  const lifetime = data.invoices.reduce((s, i) => s + Number(i.amount_paid), 0);
  const outstanding = data.invoices
    .filter((i) => i.status !== "Draft")
    .reduce((s, i) => s + Math.max(0, Number(i.total) - Number(i.amount_paid)), 0);
  const lastOrder = data.orders[0];

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/customers">
          <ArrowLeft className="size-4" /> Back to customers
        </Link>
      </Button>

      <PageHeader
        title={c.name}
        subtitle={`${c.customer_type} · ${c.phone || "no phone"}${c.email ? ` · ${c.email}` : ""}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lifetime spend" value={formatMoney(lifetime, currency)} />
        <StatCard
          label="Outstanding balance"
          value={formatMoney(outstanding, currency)}
          tone={outstanding > 0 ? "danger" : "success"}
        />
        <StatCard label="Total orders" value={data.orders.length} />
        <StatCard label="Last order" value={lastOrder ? formatDate(lastOrder.created_at) : "—"} />
      </div>

      {(c.address || c.notes) && (
        <SectionCard title="Details" className="mt-6">
          {c.address && (
            <p className="text-sm">
              <span className="text-muted-foreground">Address: </span>
              {c.address}
            </p>
          )}
          {c.notes && (
            <p className="mt-2 text-sm">
              <span className="text-muted-foreground">Notes: </span>
              {c.notes}
            </p>
          )}
        </SectionCard>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SectionCard title="Order history">
          {data.orders.length === 0 ? (
            <EmptyState message="No orders yet." />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {data.orders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-2.5">
                  <Link to="/orders/$id" params={{ id: o.id }} className="font-medium text-primary hover:underline">
                    {o.order_number}
                  </Link>
                  <StatusBadge status={o.status} />
                  <span className="ml-auto text-muted-foreground">{formatDate(o.created_at)}</span>
                  <span className="font-medium">{formatMoney(Number(o.total), currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Invoices">
          {data.invoices.length === 0 ? (
            <EmptyState message="No invoices yet." />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {data.invoices.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5">
                  <Link to="/invoices/$id" params={{ id: i.id }} className="font-medium text-primary hover:underline">
                    {i.invoice_number}
                  </Link>
                  <StatusBadge status={i.status} />
                  <span className="ml-auto text-muted-foreground">{formatDate(i.issue_date)}</span>
                  <span className="font-medium">{formatMoney(Number(i.total), currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
