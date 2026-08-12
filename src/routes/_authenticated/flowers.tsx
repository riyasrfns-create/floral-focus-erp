import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { formatDate, formatMoney, todayISO, daysLeft } from "@/lib/format";
import { downloadCSV } from "@/lib/export";
import { PageHeader, SectionCard, StatCard, EmptyState, FieldLabel } from "@/components/erp/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/flowers")({
  head: () => ({
    meta: [
      { title: "Flower Freshness — Petal & Stem Flower Shop ERP" },
      { name: "description", content: "Track flower batches, shelf life and wastage for a florist business." },
      { property: "og:title", content: "Flower Freshness — Petal & Stem Flower Shop ERP" },
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
    quantity: 0,
    unit: "stem",
    arrival_date: todayISO(),
    shelf_life_days: 7,
    supplier: "",
    cost: 0,
  });
  const [waste, setWaste] = useState({
    flower_name: "",
    quantity: 0,
    reason: "Expired",
    logged_on: todayISO(),
    estimated_loss: 0,
    notes: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["flowers"],
    queryFn: async () => {
      const [batches, wastage] = await Promise.all([
        supabase.from("flower_batches").select("*").order("arrival_date", { ascending: false }),
        supabase.from("wastage_log").select("*").order("logged_on", { ascending: false }),
      ]);
      return { batches: batches.data ?? [], wastage: wastage.data ?? [] };
    },
  });

  const addBatch = useMutation({
    mutationFn: async () => {
      if (!batch.flower_name.trim()) throw new Error("Flower name is required.");
      if (batch.quantity <= 0 || batch.shelf_life_days <= 0 || batch.cost < 0)
        throw new Error("Quantity, shelf life and cost must be valid positive numbers.");
      const { error } = await supabase.from("flower_batches").insert(batch);
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
      if (waste.quantity <= 0 || waste.estimated_loss < 0) throw new Error("Enter a valid quantity and loss.");
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
        const left = daysLeft(b.arrival_date, b.shelf_life_days);
        return {
          ...b,
          left,
          state: left < 0 ? "Expired" : left <= 2 ? "Use soon" : "Fresh",
        };
      }),
    [data],
  );

  const totalLoss = (data?.wastage ?? []).reduce((s, w) => s + Number(w.estimated_loss), 0);

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
                      <th className="py-2 pr-3 text-right">Qty</th>
                      <th className="py-2 pr-3">Arrived</th>
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
                          {Number(b.quantity)} {b.unit}
                        </td>
                        <td className="py-2.5 pr-3">{formatDate(b.arrival_date)}</td>
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
                        <td className="py-2.5 text-right">{formatMoney(Number(b.cost), currency)}</td>
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
            actions={
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
                      Loss: w.estimated_loss,
                      Staff: w.staff_name ?? "",
                      Notes: w.notes ?? "",
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
                        <td className="py-2.5 pr-3 text-right">{formatMoney(Number(w.estimated_loss), currency)}</td>
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
                value={batch.quantity}
                onChange={(e) => setBatch({ ...batch, quantity: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label>
              <FieldLabel>Unit</FieldLabel>
              <Input value={batch.unit} onChange={(e) => setBatch({ ...batch, unit: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Arrival date</FieldLabel>
              <Input
                type="date"
                value={batch.arrival_date}
                onChange={(e) => setBatch({ ...batch, arrival_date: e.target.value })}
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
              <FieldLabel>Cost</FieldLabel>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={batch.cost}
                onChange={(e) => setBatch({ ...batch, cost: Math.max(0, Number(e.target.value)) })}
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
                value={waste.estimated_loss}
                onChange={(e) => setWaste({ ...waste, estimated_loss: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>Notes</FieldLabel>
              <Textarea rows={2} value={waste.notes} onChange={(e) => setWaste({ ...waste, notes: e.target.value })} />
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
