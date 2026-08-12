import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { downloadCSV, printPDF } from "@/lib/export";
import { PageHeader, SectionCard, StatCard, EmptyState, StatusBadge, FieldLabel } from "@/components/erp/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "Daily Sales Report — Petal & Stem Flower Shop ERP" },
      { name: "description", content: "Daily, weekly and monthly flower shop sales totals with CSV and PDF export." },
      { property: "og:title", content: "Daily Sales Report — Petal & Stem Flower Shop ERP" },
      { property: "og:description", content: "Filter sales by date, customer and payment status." },
    ],
  }),
  component: SalesPage,
});

type Row = {
  key: string;
  date: string;
  ref: string;
  customer: string;
  items: string;
  quantity: number;
  amount: number;
  status: string;
  staff: string;
};

function SalesPage() {
  const qc = useQueryClient();
  const { currency } = useSettings();
  const { displayName } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customer, setCustomer] = useState("all");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    sale_date: todayISO(),
    reference: "",
    customer_id: "",
    items: "",
    quantity: 1,
    amount: 0,
    payment_status: "Paid",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const [invoices, invItems, manual, customers] = await Promise.all([
        supabase.from("invoices").select("*, customers(id,name)").neq("status", "Draft"),
        supabase.from("invoice_items").select("invoice_id,description,quantity"),
        supabase.from("sales_entries").select("*, customers(id,name)"),
        supabase.from("customers").select("id,name").order("name"),
      ]);
      const byInvoice = new Map<string, { desc: string[]; qty: number }>();
      for (const li of invItems.data ?? []) {
        const e = byInvoice.get(li.invoice_id) ?? { desc: [], qty: 0 };
        e.desc.push(li.description);
        e.qty += Number(li.quantity);
        byInvoice.set(li.invoice_id, e);
      }
      const rows: Row[] = [
        ...(invoices.data ?? []).map((i) => ({
          key: "i" + i.id,
          date: i.issue_date,
          ref: i.invoice_number,
          customer: i.customers?.name ?? "—",
          items: (byInvoice.get(i.id)?.desc ?? []).join(", ") || "—",
          quantity: byInvoice.get(i.id)?.qty ?? 0,
          amount: Number(i.total),
          status:
            Number(i.amount_paid) >= Number(i.total)
              ? "Paid"
              : Number(i.amount_paid) > 0
                ? "Partial"
                : "Unpaid",
          staff: i.staff_name,
        })),
        ...(manual.data ?? []).map((m) => ({
          key: "m" + m.id,
          date: m.sale_date,
          ref: m.reference || "Manual entry",
          customer: m.customers?.name ?? "—",
          items: m.items,
          quantity: Number(m.quantity),
          amount: Number(m.amount),
          status: m.payment_status,
          staff: m.staff_name,
        })),
      ].sort((a, b) => (a.date < b.date ? 1 : -1));
      return { rows, customers: customers.data ?? [] };
    },
  });

  const addManual = useMutation({
    mutationFn: async () => {
      if (!form.items.trim()) throw new Error("Describe the items sold.");
      if (form.amount < 0 || form.quantity <= 0) throw new Error("Quantity and amount must be positive.");
      const { error } = await supabase.from("sales_entries").insert({
        sale_date: form.sale_date,
        reference: form.reference,
        customer_id: form.customer_id || null,
        items: form.items,
        quantity: form.quantity,
        amount: form.amount,
        payment_status: form.payment_status,
        staff_name: displayName,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sale recorded.");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const custName = data?.customers.find((c) => c.id === customer)?.name;
    return all.filter(
      (r) =>
        (!from || r.date >= from) &&
        (!to || r.date <= to) &&
        (customer === "all" || r.customer === custName) &&
        (status === "all" || r.status === status),
    );
  }, [data, from, to, customer, status]);

  const today = todayISO();
  const weekStart = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const sum = (f: (r: Row) => boolean) => rows.filter(f).reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <PageHeader
        title="Daily Sales Report"
        subtitle="Every sale, invoiced or hand-entered."
        actions={
          <>
            <Button variant="outline" onClick={printPDF}>
              <Printer className="size-4" /> Print / PDF
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadCSV(
                  "daily-sales",
                  rows.map((r) => ({
                    Date: r.date,
                    Reference: r.ref,
                    Customer: r.customer,
                    Items: r.items,
                    Quantity: r.quantity,
                    Amount: r.amount,
                    Status: r.status,
                    Staff: r.staff,
                  })),
                )
              }
            >
              <Download className="size-4" /> Export CSV
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Add sale
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Today" value={formatMoney(sum((r) => r.date === today), currency)} />
        <StatCard label="Last 7 days" value={formatMoney(sum((r) => r.date >= weekStart), currency)} />
        <StatCard label="This month" value={formatMoney(sum((r) => r.date >= monthStart), currency)} />
      </div>

      <SectionCard className="mt-6">
        <div className="no-print mb-4 flex flex-wrap gap-2">
          <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
          <Select value={customer} onValueChange={setCustomer}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              {(data?.customers ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Partial">Partial</SelectItem>
              <SelectItem value="Unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <EmptyState message="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState message="No sales match your filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Items</th>
                  <th className="py-2 pr-3 text-right">Qty</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Staff</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border/60">
                    <td className="py-2.5 pr-3">{formatDate(r.date)}</td>
                    <td className="py-2.5 pr-3 font-medium">{r.ref}</td>
                    <td className="py-2.5 pr-3">{r.customer}</td>
                    <td className="max-w-56 truncate py-2.5 pr-3 text-muted-foreground">{r.items}</td>
                    <td className="py-2.5 pr-3 text-right">{r.quantity}</td>
                    <td className="py-2.5 pr-3 text-right font-medium">{formatMoney(r.amount, currency)}</td>
                    <td className="py-2.5 pr-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-2.5 text-muted-foreground">{r.staff || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a sale manually</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <FieldLabel>Date</FieldLabel>
              <Input
                type="date"
                value={form.sale_date}
                onChange={(e) => setForm({ ...form, sale_date: e.target.value })}
              />
            </label>
            <label>
              <FieldLabel>Reference</FieldLabel>
              <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>Customer</FieldLabel>
              <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Walk-in / none" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.customers ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>Items sold *</FieldLabel>
              <Input value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Quantity</FieldLabel>
              <Input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Math.max(1, Number(e.target.value)) })}
              />
            </label>
            <label>
              <FieldLabel>Amount</FieldLabel>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>Payment status</FieldLabel>
              <Select
                value={form.payment_status}
                onValueChange={(v) => setForm({ ...form, payment_status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Paid">Paid</SelectItem>
                  <SelectItem value="Partial">Partial</SelectItem>
                  <SelectItem value="Unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => addManual.mutate()} disabled={addManual.isPending}>
              Save sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
