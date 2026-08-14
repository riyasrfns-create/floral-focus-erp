import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { formatDate, formatMoney, todayISO, daysBetween } from "@/lib/format";
import { downloadCSV } from "@/lib/export";
import { PageHeader, SectionCard, StatCard, EmptyState, FieldLabel } from "@/components/erp/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/flowers")({
  head: () => ({
    meta: [
      { title: "Flower Freshness — Flower Industries Flower Shop ERP" },
      { name: "description", content: "Track flower batches, shelf life and wastage for a florist business." },
      { property: "og:title", content: "Flower Freshness — Flower Industries Flower Shop ERP" },
      { property: "og:description", content: "Batch arrival dates, expiry alerts and wastage logging." },
    ],
  }),
  component: FlowersPage,
});

function FlowersPage() {
  const qc = useQueryClient();
  const { currency } = useSettings();
  const { displayName } = useAuth();
  const [batchOpen, setBatchOpen] = useState(false);
  const [wasteOpen, setWasteOpen] = useState(false);
  const [batch, setBatch] = useState({
    flower_name: "",
    variety: "",
    quantity_received: 0,
    date_received: todayISO(),
    shelf_life_days: 7,
    supplier: "",
    cost_per_unit: 0,
  });
  const [waste, setWaste] = useState({
    flower_name: "",
    quantity: 0,
    reason: "Expired",
    logged_on: todayISO(),
    cost_value: 0,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["flowers"],
    queryFn: async () => {
      const [batches, wastage] = await Promise.all([
        supabase.from("flower_batches").select("*").order("date_received", { ascending: false }),
        supabase.from("wastage_log").select("*").order("logged_on", { ascending: false }),
      ]);
      return { batches: batches.data ?? [], wastage: wastage.data ?? [] };
    },
  });

  const addBatch = useMutation({
    mutationFn: async () => {
      if (!batch.flower_name.trim()) throw new Error("Flower name is required.");
      if (batch.quantity_received <= 0 || batch.shelf_life_days <= 0 || batch.cost_per_unit < 0)
        throw new Error("Quantity, shelf life and cost must be valid positive numbers.");
      const { error } = await supabase
        .from("flower_batches")
        .insert({ ...batch, current_stock: batch.quantity_received });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Batch added.");
      setBatchOpen(false);
      void qc.invalidateQueries({ queryKey: ["flowers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addWaste = useMutation({
    mutationFn: async () => {
      if (!waste.flower_name.trim()) throw new Error("Flower name is required.");
      if (waste.quantity <= 0 || waste.cost_value < 0) throw new Error("Enter a valid quantity and loss.");
      const { error } = await supabase.from("wastage_log").insert({ ...waste, staff_name: displayName });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Wastage logged.");
      setWasteOpen(false);
      void qc.invalidateQueries({ queryKey: ["flowers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const batches = useMemo(
    () =>
      (data?.batches ?? []).map((b) => {
        const left = b.shelf_life_days - daysBetween(b.date_received);
        return {
          ...b,
          left,
          state: left < 0 ? "Expired" : left <= 2 ? "Use soon" : "Fresh",
        };
      }),
    [data],
  );

  const totalLoss = (data?.wastage ?? []).reduce((s, w) => s + Number(w.cost_value), 0);

  return (
    <div>
      <PageHeader
        title="Flower Management"
        subtitle="Freshness tracking and wastage for perishable stock."
        actions={
          <>
            <Button variant="outline" onClick={() => setWasteOpen(true)}>
              Log wastage
            </Button>
            <Button onClick={() => setBatchOpen(true)}>
              <Plus className="size-4" /> Add batch
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active batches" value={String(batches.filter((b) => b.left >= 0).length)} />
        <StatCard label="Expiring in 2 days" value={String(batches.filter((b) => b.left >= 0 && b.left <= 2).length)} />
        <StatCard label="Total wastage loss" value={formatMoney(totalLoss, currency)} />
      </div>

      <Tabs defaultValue="batches" className="mt-6">
        <TabsList>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="wastage">Wastage report</TabsTrigger>
        </TabsList>

        <TabsContent value="batches">
          <SectionCard>
            {isLoading ? (
              <EmptyState message="Loading…" />
            ) : batches.length === 0 ? (
              <EmptyState message="No flower batches recorded yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Flower</th>
                      <th className="py-2 pr-3 text-right">Stock / received</th>
                      <th className="py-2 pr-3">Received</th>
                      <th className="py-2 pr-3 text-right">Shelf life</th>
                      <th className="py-2 pr-3">Freshness</th>
                      <th className="py-2 pr-3">Supplier</th>
                      <th className="py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.id} className="border-b border-border/60">
                        <td className="py-2.5 pr-3 font-medium">{b.flower_name}</td>
                        <td className="py-2.5 pr-3 text-right">
                          {Number(b.current_stock)} / {Number(b.quantity_received)}
                        </td>
                        <td className="py-2.5 pr-3">{formatDate(b.date_received)}</td>
                        <td className="py-2.5 pr-3 text-right">{b.shelf_life_days} days</td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={
                              b.state === "Expired"
                                ? "text-destructive"
                                : b.state === "Use soon"
                                  ? "text-accent-foreground"
                                  : "text-muted-foreground"
                            }
                          >
                            {b.state}
                            {b.left >= 0 ? ` · ${b.left}d left` : ""}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{b.supplier ?? "—"}</td>
                        <td className="py-2.5 text-right">{formatMoney(Number(b.cost_per_unit) * Number(b.quantity_received), currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="wastage">
          <SectionCard
            title="Wastage log"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCSV(
                    "wastage",
                    (data?.wastage ?? []).map((w) => ({
                      Date: w.logged_on,
                      Flower: w.flower_name,
                      Quantity: w.quantity,
                      Reason: w.reason,
                      Loss: w.cost_value,
                      Staff: w.staff_name ?? "",
                    })),
                  )
                }
              >
                <Download className="size-4" /> Export CSV
              </Button>
            }
          >
            {(data?.wastage ?? []).length === 0 ? (
              <EmptyState message="No wastage logged — nice work." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Flower</th>
                      <th className="py-2 pr-3 text-right">Qty</th>
                      <th className="py-2 pr-3">Reason</th>
                      <th className="py-2 pr-3 text-right">Loss</th>
                      <th className="py-2">Staff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.wastage ?? []).map((w) => (
                      <tr key={w.id} className="border-b border-border/60">
                        <td className="py-2.5 pr-3">{formatDate(w.logged_on)}</td>
                        <td className="py-2.5 pr-3 font-medium">{w.flower_name}</td>
                        <td className="py-2.5 pr-3 text-right">{Number(w.quantity)}</td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{w.reason}</td>
                        <td className="py-2.5 pr-3 text-right">{formatMoney(Number(w.cost_value), currency)}</td>
                        <td className="py-2.5 text-muted-foreground">{w.staff_name ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add flower batch</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <FieldLabel>Flower name *</FieldLabel>
              <Input value={batch.flower_name} onChange={(e) => setBatch({ ...batch, flower_name: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Quantity</FieldLabel>
              <Input
                type="number"
                min={0}
                value={batch.quantity_received}
                onChange={(e) => setBatch({ ...batch, quantity_received: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label>
              <FieldLabel>Variety</FieldLabel>
              <Input value={batch.variety} onChange={(e) => setBatch({ ...batch, variety: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Arrival date</FieldLabel>
              <Input
                type="date"
                value={batch.date_received}
                onChange={(e) => setBatch({ ...batch, date_received: e.target.value })}
              />
            </label>
            <label>
              <FieldLabel>Shelf life (days)</FieldLabel>
              <Input
                type="number"
                min={1}
                value={batch.shelf_life_days}
                onChange={(e) => setBatch({ ...batch, shelf_life_days: Math.max(1, Number(e.target.value)) })}
              />
            </label>
            <label>
              <FieldLabel>Supplier</FieldLabel>
              <Input value={batch.supplier} onChange={(e) => setBatch({ ...batch, supplier: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Cost per unit</FieldLabel>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={batch.cost_per_unit}
                onChange={(e) => setBatch({ ...batch, cost_per_unit: Math.max(0, Number(e.target.value)) })}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => addBatch.mutate()} disabled={addBatch.isPending}>
              Save batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={wasteOpen} onOpenChange={setWasteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log wastage</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <FieldLabel>Flower name *</FieldLabel>
              <Input value={waste.flower_name} onChange={(e) => setWaste({ ...waste, flower_name: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Quantity</FieldLabel>
              <Input
                type="number"
                min={0}
                value={waste.quantity}
                onChange={(e) => setWaste({ ...waste, quantity: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label>
              <FieldLabel>Date</FieldLabel>
              <Input
                type="date"
                value={waste.logged_on}
                onChange={(e) => setWaste({ ...waste, logged_on: e.target.value })}
              />
            </label>
            <label>
              <FieldLabel>Reason</FieldLabel>
              <Input value={waste.reason} onChange={(e) => setWaste({ ...waste, reason: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Estimated loss</FieldLabel>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={waste.cost_value}
                onChange={(e) => setWaste({ ...waste, cost_value: Math.max(0, Number(e.target.value)) })}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWasteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => addWaste.mutate()} disabled={addWaste.isPending}>
              Save wastage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
