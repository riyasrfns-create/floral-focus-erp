import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { formatDate, formatMoney } from "@/lib/format";
import { INVOICE_STATUSES } from "@/lib/erp";
import { downloadCSV } from "@/lib/export";
import { PageHeader, SectionCard, EmptyState, StatusBadge } from "@/components/erp/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/invoices/")({
  head: () => ({
    meta: [
      { title: "Invoices — Flower Industries Flower Shop ERP" },
      { name: "description", content: "Create, send and settle flower shop invoices with printable PDFs." },
      { property: "og:title", content: "Invoices — Flower Industries Flower Shop ERP" },
      { property: "og:description", content: "Invoice list with search by customer, date and payment status." },
    ],
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const { currency } = useSettings();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, customers(name)")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter(
      (i) =>
        (status === "all" || i.status === status) &&
        (!from || i.issue_date >= from) &&
        (!to || i.issue_date <= to) &&
        (!q ||
          i.invoice_number.toLowerCase().includes(q) ||
          (i.customers?.name ?? "").toLowerCase().includes(q)),
    );
  }, [invoices, search, status, from, to]);

  const outstanding = rows.reduce(
    (s, i) => s + (i.status === "Draft" ? 0 : Math.max(0, Number(i.total) - Number(i.amount_paid))),
    0,
  );

  return (
    <div>
      <PageHeader
        title="Invoicing"
        subtitle={`${rows.length} invoices · ${formatMoney(outstanding, currency)} outstanding`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCSV(
                  "invoices",
                  rows.map((i) => ({
                    Invoice: i.invoice_number,
                    Date: i.issue_date,
                    Customer: i.customers?.name ?? "",
                    Status: i.status,
                    Total: Number(i.total),
                    Paid: Number(i.amount_paid),
                    Balance: Number(i.total) - Number(i.amount_paid),
                  })),
                )
              }
            >
              <Download className="size-4" /> Export CSV
            </Button>
            <Button asChild>
              <Link to="/invoices/new">
                <Plus className="size-4" /> New invoice
              </Link>
            </Button>
          </>
        }
      />

      <SectionCard>
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search invoice # or customer"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {INVOICE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        {isLoading ? (
          <EmptyState message="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState message="No invoices match your filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Invoice #</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className="border-b border-border/60">
                    <td className="py-2.5 pr-3 font-medium">
                      <Link to="/invoices/$id" params={{ id: i.id }} className="text-primary hover:underline">
                        {i.invoice_number}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3">{formatDate(i.issue_date)}</td>
                    <td className="py-2.5 pr-3">{i.customers?.name ?? "—"}</td>
                    <td className="py-2.5 pr-3">
                      <StatusBadge status={i.status} />
                    </td>
                    <td className="py-2.5 pr-3 text-right">{formatMoney(Number(i.total), currency)}</td>
                    <td className="py-2.5 pr-3 text-right font-medium">
                      {formatMoney(Math.max(0, Number(i.total) - Number(i.amount_paid)), currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
