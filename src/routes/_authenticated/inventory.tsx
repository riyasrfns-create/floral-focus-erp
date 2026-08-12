import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { formatMoney } from "@/lib/format";
import { downloadCSV } from "@/lib/export";
import { PageHeader, SectionCard, StatCard, EmptyState, FieldLabel } from "@/components/erp/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Petal & Stem Flower Shop ERP" },
      { name: "description", content: "Track flower shop stock levels, costs, prices and low-stock alerts." },
      { property: "og:title", content: "Inventory — Petal & Stem Flower Shop ERP" },
      { property: "og:description", content: "Manage items, adjust stock and export inventory as CSV." },
    ],
  }),
  component: InventoryPage,
});

const emptyForm = {
  name: "",
  category_id: "",
  unit: "stem",
  quantity: 0,
  reorder_level: 0,
  cost_price: 0,
  selling_price: 0,
  supplier: "",
};

function InventoryPage() {
  const qc = useQueryClient();
  const { currency } = useSettings();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("name");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const [items, categories] = await Promise.all([
        supabase.from("inventory_items").select("*, categories(id,name)").order("name"),
        supabase.from("categories").select("id,name").order("name"),
      ]);
      return { items: items.data ?? [], categories: categories.data ?? [] };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Item name is required.");
      if (form.quantity < 0 || form.cost_price < 0 || form.selling_price < 0)
        throw new Error("Quantities and prices cannot be negative.");
      const payload = { ...form, category_id: form.category_id || null };
      const { error } = editId
        ? await supabase.from("inventory_items").update(payload).eq("id", editId)
        : await supabase.from("inventory_items").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editId ? "Item updated." : "Item added.");
      setOpen(false);
      setEditId(null);
      setForm(emptyForm);
      void qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = useMemo(() => {
    const list = (data?.items ?? []).filter(
      (i) =>
        i.name.toLowerCase().includes(search.toLowerCase()) &&
        (category === "all" || i.category_id === category),
    );
    return [...list].sort((a, b) =>
      sort === "quantity"
        ? Number(a.quantity) - Number(b.quantity)
        : sort === "value"
          ? Number(b.quantity) * Number(b.cost_price) - Number(a.quantity) * Number(a.cost_price)
          : a.name.localeCompare(b.name),
    );
  }, [data, search, category, sort]);

  const lowStock = items.filter((i) => Number(i.quantity) <= Number(i.reorder_level));
  const stockValue = items.reduce((s, i) => s + Number(i.quantity) * Number(i.cost_price), 0);

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Stock on hand, costs and reorder alerts."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCSV(
                  "inventory",
                  items.map((i) => ({
                    Item: i.name,
                    Category: i.categories?.name ?? "",
                    Unit: i.unit,
                    Quantity: i.quantity,
                    "Reorder level": i.reorder_level,
                    "Cost price": i.cost_price,
                    "Selling price": i.selling_price,
                    Supplier: i.supplier ?? "",
                  })),
                )
              }
            >
              <Download className="size-4" /> Export CSV
            </Button>
            <Button
              onClick={() => {
                setEditId(null);
                setForm(emptyForm);
                setOpen(true);
              }}
            >
              <Plus className="size-4" /> Add item
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Items tracked" value={String(items.length)} />
        <StatCard label="Low stock" value={String(lowStock.length)} />
        <StatCard label="Stock value" value={formatMoney(stockValue, currency)} />
      </div>

      <SectionCard className="mt-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <Input
            placeholder="Search items…"
            className="w-56"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(data?.categories ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort: name</SelectItem>
              <SelectItem value="quantity">Sort: quantity</SelectItem>
              <SelectItem value="value">Sort: stock value</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <EmptyState message="Loading…" />
        ) : items.length === 0 ? (
          <EmptyState message="No inventory items yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3 text-right">Qty</th>
                  <th className="py-2 pr-3 text-right">Reorder at</th>
                  <th className="py-2 pr-3 text-right">Cost</th>
                  <th className="py-2 pr-3 text-right">Price</th>
                  <th className="py-2 pr-3">Supplier</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const low = Number(i.quantity) <= Number(i.reorder_level);
                  return (
                    <tr key={i.id} className="border-b border-border/60">
                      <td className="py-2.5 pr-3 font-medium">
                        {i.name}
                        {low && <span className="ml-2 text-xs text-destructive">Low stock</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{i.categories?.name ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-right">
                        {Number(i.quantity)} {i.unit}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-muted-foreground">{Number(i.reorder_level)}</td>
                      <td className="py-2.5 pr-3 text-right">{formatMoney(Number(i.cost_price), currency)}</td>
                      <td className="py-2.5 pr-3 text-right">{formatMoney(Number(i.selling_price), currency)}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{i.supplier ?? "—"}</td>
                      <td className="py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditId(i.id);
                            setForm({
                              name: i.name,
                              category_id: i.category_id ?? "",
                              unit: i.unit,
                              quantity: Number(i.quantity),
                              reorder_level: Number(i.reorder_level),
                              cost_price: Number(i.cost_price),
                              selling_price: Number(i.selling_price),
                              supplier: i.supplier ?? "",
                            });
                            setOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit item" : "Add inventory item"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <FieldLabel>Item name *</FieldLabel>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Category</FieldLabel>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Uncategorised" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label>
              <FieldLabel>Unit</FieldLabel>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Quantity in stock</FieldLabel>
              <Input
                type="number"
                min={0}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label>
              <FieldLabel>Reorder level</FieldLabel>
              <Input
                type="number"
                min={0}
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label>
              <FieldLabel>Cost price</FieldLabel>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label>
              <FieldLabel>Selling price</FieldLabel>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.selling_price}
                onChange={(e) => setForm({ ...form, selling_price: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>Supplier</FieldLabel>
              <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
