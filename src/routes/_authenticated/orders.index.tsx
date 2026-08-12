import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { ORDER_STATUSES, lineTotal, type LineItem } from "@/lib/erp";
import { LineItemsEditor, type InventoryOption } from "@/components/erp/LineItemsEditor";
import { PageHeader, SectionCard, EmptyState, StatusBadge, FieldLabel } from "@/components/erp/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/orders/")({
  head: () => ({
    meta: [
      { title: "Orders — Petal & Stem Flower Shop ERP" },
      { name: "description", content: "Create and track flower orders from new through to delivered." },
      { property: "og:title", content: "Orders — Petal & Stem Flower Shop ERP" },
      { property: "og:description", content: "Flower shop order pipeline with delivery and pickup tracking." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const qc = useQueryClient();
  const { displayName } = useAuth();
  const { currency } = useSettings();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState("");
  const [open, setOpen] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [fulfilment, setFulfilment] = useState("Delivery");
  const [requestedDate, setRequestedDate] = useState(todayISO());
  const [instructions, setInstructions] = useState("");
  const [cardMessage, setCardMessage] = useState("");
  const [address, setAddress] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { item_id: null, description: "", quantity: 1, unit_price: 0 },
  ]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as (Record<string, never> & {
        id: string;
        order_number: string;
        status: string;
        fulfilment: string;
        requested_date: string | null;
        total: number;
        created_at: string;
        customers: { name: string } | null;
      })[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name,address").order("name");
      if (error) throw error;
      return data as { id: string; name: string; address: string | null }[];
    },
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("id,name,unit,selling_price")
        .order("name");
      if (error) throw error;
      return data as InventoryOption[];
    },
  });

  const total = items.reduce((s, l) => s + lineTotal(l), 0);

  const create = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Please select a customer.");
      const valid = items.filter((l) => l.description.trim() && l.quantity > 0);
      if (!valid.length) throw new Error("Add at least one item with a description and quantity.");

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          customer_id: customerId,
          fulfilment,
          requested_date: requestedDate || null,
          special_instructions: instructions || null,
          card_message: cardMessage || null,
          total,
          staff_name: displayName,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: e2 } = await supabase.from("order_items").insert(
        valid.map((l) => ({
          order_id: order.id,
          item_id: l.item_id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
        })),
      );
      if (e2) throw e2;

      if (fulfilment === "Delivery") {
        const cust = customers.find((c) => c.id === customerId);
        await supabase.from("deliveries").insert({
          order_id: order.id,
          customer_id: customerId,
          address: address || cust?.address || "",
          delivery_date: requestedDate || todayISO(),
        });
      }
    },
    onSuccess: () => {
      toast.success("Order created.");
      setOpen(false);
      setItems([{ item_id: null, description: "", quantity: 1, unit_price: 0 }]);
      setInstructions("");
      setCardMessage("");
      setAddress("");
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["deliveries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(
      (o) =>
        (status === "all" || o.status === status) &&
        (!date || (o.requested_date ?? o.created_at.slice(0, 10)) === date) &&
        (!q ||
          o.order_number.toLowerCase().includes(q) ||
          (o.customers?.name ?? "").toLowerCase().includes(q)),
    );
  }, [orders, search, status, date]);

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="From first phone call to handed over."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New order
          </Button>
        }
      />

      <SectionCard>
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search order # or customer"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="w-44"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {isLoading ? (
          <EmptyState message="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState message="No orders match your filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Order #</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Requested</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-b border-border/60">
                    <td className="py-2.5 pr-3 font-medium">
                      <Link to="/orders/$id" params={{ id: o.id }} className="text-primary hover:underline">
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3">{o.customers?.name ?? "—"}</td>
                    <td className="py-2.5 pr-3">{formatDate(o.requested_date)}</td>
                    <td className="py-2.5 pr-3">{o.fulfilment}</td>
                    <td className="py-2.5 pr-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium">
                      {formatMoney(Number(o.total), currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>New order</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <FieldLabel>Customer *</FieldLabel>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label>
              <FieldLabel>Delivery or pickup</FieldLabel>
              <Select value={fulfilment} onValueChange={setFulfilment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Delivery">Delivery</SelectItem>
                  <SelectItem value="Pickup">Pickup</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label>
              <FieldLabel>Requested date</FieldLabel>
              <Input type="date" value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} />
            </label>
            {fulfilment === "Delivery" && (
              <label>
                <FieldLabel>Delivery address (leave blank to use customer address)</FieldLabel>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </label>
            )}
            <label className="sm:col-span-2">
              <FieldLabel>Special instructions (e.g. "no lilies")</FieldLabel>
              <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>Card message</FieldLabel>
              <Textarea rows={2} value={cardMessage} onChange={(e) => setCardMessage(e.target.value)} />
            </label>
          </div>

          <div className="mt-2">
            <FieldLabel>Items</FieldLabel>
            <LineItemsEditor items={items} onChange={setItems} inventory={inventory} currency={currency} />
            <p className="mt-3 text-right text-sm font-medium">
              Order total: {formatMoney(total, currency)}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Create order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
