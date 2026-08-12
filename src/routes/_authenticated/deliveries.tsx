import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTime, todayISO } from "@/lib/format";
import { DELIVERY_STATUSES } from "@/lib/erp";
import { downloadCSV, printPDF } from "@/lib/export";
import { PageHeader, SectionCard, EmptyState, StatusBadge, FieldLabel } from "@/components/erp/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/deliveries")({
  head: () => ({
    meta: [
      { title: "Delivery Report — Petal & Stem Flower Shop ERP" },
      { name: "description", content: "Daily delivery route sheet with rider assignment and status updates." },
      { property: "og:title", content: "Delivery Report — Petal & Stem Flower Shop ERP" },
      { property: "og:description", content: "Track flower deliveries from pending to delivered." },
    ],
  }),
  component: DeliveriesPage,
});

function DeliveriesPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [status, setStatus] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ status: "Pending", rider_name: "", notes: "", photo_reference: "" });

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ["deliveries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliveries")
        .select("*, customers(name,phone), orders(order_number)")
        .order("delivery_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editId) return;
      const { error } = await supabase
        .from("deliveries")
        .update({
          status: form.status,
          rider_name: form.rider_name || null,
          notes: form.notes || null,
          photo_reference: form.photo_reference || null,
          status_updated_at: new Date().toISOString(),
        })
        .eq("id", editId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Delivery updated.");
      setEditId(null);
      void qc.invalidateQueries({ queryKey: ["deliveries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(
    () =>
      deliveries.filter(
        (d) => (!date || d.delivery_date === date) && (status === "all" || d.status === status),
      ),
    [deliveries, date, status],
  );

  return (
    <div>
      <PageHeader
        title="Delivery Report"
        subtitle="Today's route sheet and delivery status."
        actions={
          <>
            <Button variant="outline" onClick={printPDF}>
              <Printer className="size-4" /> Print route sheet
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadCSV(
                  `deliveries-${date || "all"}`,
                  rows.map((d) => ({
                    Order: d.orders?.order_number ?? "",
                    Customer: d.customers?.name ?? "",
                    Phone: d.customers?.phone ?? "",
                    Address: d.address,
                    Date: d.delivery_date,
                    Rider: d.rider_name ?? "",
                    Status: d.status,
                    Notes: d.notes ?? "",
                  })),
                )
              }
            >
              <Download className="size-4" /> Export CSV
            </Button>
          </>
        }
      />

      <SectionCard>
        <div className="no-print mb-4 flex flex-wrap gap-2">
          <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button variant="ghost" onClick={() => setDate("")}>
            All dates
          </Button>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {DELIVERY_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <EmptyState message="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState message="No deliveries scheduled for this filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Order #</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Address</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Rider</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Last update</th>
                  <th className="no-print py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-b border-border/60">
                    <td className="py-2.5 pr-3 font-medium">{d.orders?.order_number ?? "—"}</td>
                    <td className="py-2.5 pr-3">
                      {d.customers?.name ?? "—"}
                      <span className="block text-xs text-muted-foreground">{d.customers?.phone}</span>
                    </td>
                    <td className="max-w-56 py-2.5 pr-3 text-muted-foreground">{d.address || "—"}</td>
                    <td className="py-2.5 pr-3">{formatDate(d.delivery_date)}</td>
                    <td className="py-2.5 pr-3">{d.rider_name || "—"}</td>
                    <td className="py-2.5 pr-3">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                      {d.status_updated_at ? formatDateTime(d.status_updated_at) : "—"}
                      {d.notes ? <span className="block">{d.notes}</span> : null}
                    </td>
                    <td className="no-print py-2.5 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditId(d.id);
                          setForm({
                            status: d.status,
                            rider_name: d.rider_name ?? "",
                            notes: d.notes ?? "",
                            photo_reference: d.photo_reference ?? "",
                          });
                        }}
                      >
                        Update
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog open={!!editId} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update delivery</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block">
              <FieldLabel>Status</FieldLabel>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELIVERY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block">
              <FieldLabel>Assigned rider / staff</FieldLabel>
              <Input
                value={form.rider_name}
                onChange={(e) => setForm({ ...form, rider_name: e.target.value })}
              />
            </label>
            <label className="block">
              <FieldLabel>Notes (e.g. "left at reception")</FieldLabel>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <label className="block">
              <FieldLabel>Photo reference</FieldLabel>
              <Input
                value={form.photo_reference}
                onChange={(e) => setForm({ ...form, photo_reference: e.target.value })}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>
              Cancel
            </Button>
            <Button onClick={() => update.mutate()} disabled={update.isPending}>
              Save update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
