import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { INVOICE_STATUSES, PAYMENT_METHODS, invoiceStatusFor } from "@/lib/erp";
import { printPDF } from "@/lib/export";
import { PageHeader, SectionCard, EmptyState, StatusBadge, FieldLabel } from "@/components/erp/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/invoices/$id")({
  head: () => ({
    meta: [
      { title: "Invoice — Flower Industries Flower Shop ERP" },
      { name: "description", content: "Printable flower shop invoice with payment recording." },
      { property: "og:title", content: "Invoice — Flower Industries Flower Shop ERP" },
      { property: "og:description", content: "View, print and settle a flower shop invoice." },
    ],
  }),
  component: InvoiceDetail,
});

function InvoiceDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { displayName } = useAuth();
  const { currency, settings } = useSettings();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<string>("Cash");
  const [paidOn, setPaidOn] = useState(todayISO());

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const [invoice, items, payments] = await Promise.all([
        supabase.from("invoices").select("*, customers(id,name,phone,address,email)").eq("id", id).maybeSingle(),
        supabase.from("invoice_items").select("*").eq("invoice_id", id),
        supabase.from("payments").select("*").eq("invoice_id", id).order("paid_on"),
      ]);
      return { invoice: invoice.data, items: items.data ?? [], payments: payments.data ?? [] };
    },
  });

  const addPayment = useMutation({
    mutationFn: async () => {
      if (!data?.invoice) throw new Error("Invoice not loaded.");
      if (amount <= 0) throw new Error("Amount must be greater than zero.");
      const { error } = await supabase.from("payments").insert({
        invoice_id: id,
        amount,
        method,
        paid_on: paidOn,
        staff_name: displayName,
      });
      if (error) throw error;
      const paid = Number(data.invoice.amount_paid) + amount;
      const status = invoiceStatusFor(Number(data.invoice.total), paid, data.invoice.status, data.invoice.due_date);
      const { error: e2 } = await supabase
        .from("invoices")
        .update({ amount_paid: paid, status })
        .eq("id", id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Payment recorded.");
      setAmount(0);
      void qc.invalidateQueries({ queryKey: ["invoice", id] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice status updated.");
      void qc.invalidateQueries({ queryKey: ["invoice", id] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <EmptyState message="Loading…" />;
  if (!data?.invoice) return <EmptyState message="Invoice not found." />;

  const inv = data.invoice;
  const balance = Math.max(0, Number(inv.total) - Number(inv.amount_paid));

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="no-print mb-3">
        <Link to="/invoices">
          <ArrowLeft className="size-4" /> Back to invoices
        </Link>
      </Button>

      <PageHeader
        title={inv.invoice_number}
        subtitle={`${inv.customers?.name ?? "No customer"} · issued ${formatDate(inv.issue_date)}`}
        actions={
          <>
            <Select value={inv.status} onValueChange={(v) => setStatus.mutate(v)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVOICE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={printPDF}>
              <Printer className="size-4" /> Print / PDF
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="print-area surface-card p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
            <div className="flex items-start gap-3">
              {settings?.logo_url && (
                <img src={settings.logo_url} alt="Business logo" className="size-14 rounded-lg object-cover" />
              )}
              <div>
                <h2 className="font-display text-xl">{settings?.business_name}</h2>
                <p className="text-xs text-muted-foreground">{settings?.address}</p>
                <p className="text-xs text-muted-foreground">
                  {settings?.phone} {settings?.email ? `· ${settings.email}` : ""}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-semibold">{inv.invoice_number}</p>
              <p className="text-xs text-muted-foreground">Issued {formatDate(inv.issue_date)}</p>
              {inv.due_date && <p className="text-xs text-muted-foreground">Due {formatDate(inv.due_date)}</p>}
              <div className="mt-2">
                <StatusBadge status={inv.status} />
              </div>
            </div>
          </div>

          <div className="py-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Bill to</p>
            <p className="font-medium">{inv.customers?.name ?? "—"}</p>
            <p className="text-muted-foreground">{inv.customers?.address ?? ""}</p>
            <p className="text-muted-foreground">{inv.customers?.phone ?? ""}</p>
          </div>

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
                  <td className="py-2.5 text-right">
                    {formatMoney(Number(l.quantity) * Number(l.unit_price), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="ml-auto mt-4 max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{formatMoney(Number(inv.subtotal), currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd>-{formatMoney(Number(inv.discount), currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tax ({Number(inv.tax_rate)}%)</dt>
              <dd>{formatMoney(Number(inv.tax_amount), currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-display text-lg font-semibold">
              <dt>Total</dt>
              <dd>{formatMoney(Number(inv.total), currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Paid</dt>
              <dd>{formatMoney(Number(inv.amount_paid), currency)}</dd>
            </div>
            <div className="flex justify-between font-medium">
              <dt>Balance due</dt>
              <dd>{formatMoney(balance, currency)}</dd>
            </div>
          </dl>
        </div>

        <div className="no-print space-y-4">
          <SectionCard title="Record a payment">
            <div className="space-y-3">
              <label>
                <FieldLabel>Amount paid</FieldLabel>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                />
              </label>
              <label>
                <FieldLabel>Method</FieldLabel>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label>
                <FieldLabel>Date</FieldLabel>
                <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </label>
              <Button className="w-full" onClick={() => addPayment.mutate()} disabled={addPayment.isPending}>
                Mark as paid
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Payment history">
            {data.payments.length === 0 ? (
              <EmptyState message="No payments recorded." />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {data.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <span>
                      {formatDate(p.paid_on)} · {p.method}
                    </span>
                    <span className="font-medium">{formatMoney(Number(p.amount), currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
