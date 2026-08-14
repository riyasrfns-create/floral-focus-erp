import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { formatDate, formatMoney } from "@/lib/format";
import { ORDER_STATUSES, invoiceTotals, nextInvoiceNumber } from "@/lib/erp";
import { PageHeader, SectionCard, EmptyState, StatusBadge } from "@/components/erp/ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/orders/$id")({
  head: () => ({
    meta: [
      { title: "Order details — Flower Industries Flower Shop ERP" },
      { name: "description", content: "Order items, status flow and one-click invoice conversion." },
      { property: "og:title", content: "Order details — Flower Industries Flower Shop ERP" },
      { property: "og:description", content: "Track a flower shop order through preparation and handover." },
    ],
  }),
  component: OrderDetail,
});

function OrderDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { displayName } = useAuth();
  const { currency, settings } = useSettings();

  const { data, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const [order, items, invoice] = await Promise.all([
        supabase.from("orders").select("*, customers(id,name,phone,address)").eq("id", id).maybeSingle(),
        supabase.from("order_items").select("*").eq("order_id", id),
        supabase.from("invoices").select("id,invoice_number").eq("order_id", id).maybeSingle(),
      ]);
      return { order: order.data, items: items.data ?? [], invoice: invoice.data };
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order status updated.");
      void qc.invalidateQueries({ queryKey: ["order", id] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    mutationFn: async () => {
      if (!data?.order) throw new Error("Order not loaded.");
      const lines = data.items.map((l) => ({
        item_id: l.item_id,
        description: l.description,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
      }));
      if (!lines.length) throw new Error("This order has no items to invoice.");

      const taxRate = Number(settings?.default_tax_rate ?? 0);
      const totals = invoiceTotals(lines, 0, taxRate);
      const number = await nextInvoiceNumber();

      const { data: inv, error } = await supabase
        .from("invoices")
        .insert({
          invoice_number: number,
          customer_id: data.order.customer_id,
          order_id: data.order.id,
          status: "Draft",
          subtotal: totals.subtotal,
          tax_rate: taxRate,
          tax_amount: totals.tax_amount,
          total: totals.total,
          staff_name: displayName,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: e2 } = await supabase
        .from("invoice_items")
        .insert(lines.map((l) => ({ ...l, invoice_id: inv.id })));
      if (e2) throw e2;
      return inv.id as string;
    },
    onSuccess: (invId) => {
      toast.success("Invoice created from order.");
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void navigate({ to: "/invoices/$id", params: { id: invId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <EmptyState message="Loading…" />;
  if (!data?.order) return <EmptyState message="Order not found." />;

  const o = data.order;

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/orders">
          <ArrowLeft className="size-4" /> Back to orders
        </Link>
      </Button>

      <PageHeader
        title={o.order_number}
        subtitle={`${o.customers?.name ?? "No customer"} · ${o.fulfilment} · requested ${formatDate(o.requested_date)}`}
        actions={
          <>
            <Select value={o.status} onValueChange={(v) => setStatus.mutate(v)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {data.invoice ? (
              <Button asChild variant="outline">
                <Link to="/invoices/$id" params={{ id: data.invoice.id }}>
                  <FileText className="size-4" /> {data.invoice.invoice_number}
                </Link>
              </Button>
            ) : (
              <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
                <FileText className="size-4" /> Convert to invoice
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Items" className="lg:col-span-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3 text-right">Unit price</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((l) => (
                <tr key={l.id} className="border-b border-border/60">
                  <td className="py-2.5 pr-3">{l.description}</td>
                  <td className="py-2.5 pr-3 text-right">{Number(l.quantity)}</td>
                  <td className="py-2.5 pr-3 text-right">{formatMoney(Number(l.unit_price), currency)}</td>
                  <td className="py-2.5 text-right font-medium">
                    {formatMoney(Number(l.quantity) * Number(l.unit_price), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-right font-display text-lg font-semibold">
            {formatMoney(Number(o.total), currency)}
          </p>
        </SectionCard>

        <SectionCard title="Order details">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <StatusBadge status={o.status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Customer</dt>
              <dd>
                {o.customers ? (
                  <Link
                    to="/customers/$id"
                    params={{ id: o.customers.id }}
                    className="text-primary hover:underline"
                  >
                    {o.customers.name}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Address</dt>
              <dd>{o.customers?.address || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Special instructions</dt>
              <dd>{o.special_instructions || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Card message</dt>
              <dd>{o.card_message || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Recorded by</dt>
              <dd>{o.staff_name || "—"}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>
    </div>
  );
}
