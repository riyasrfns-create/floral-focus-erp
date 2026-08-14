import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { formatMoney, todayISO } from "@/lib/format";
import { invoiceTotals, nextInvoiceNumber, type LineItem } from "@/lib/erp";
import { LineItemsEditor, type InventoryOption } from "@/components/erp/LineItemsEditor";
import { PageHeader, SectionCard, FieldLabel } from "@/components/erp/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/invoices/new")({
  head: () => ({
    meta: [
      { title: "New invoice — Flower Industries Flower Shop ERP" },
      { name: "description", content: "Create a flower shop invoice with items, discount and tax." },
      { property: "og:title", content: "New invoice — Flower Industries Flower Shop ERP" },
      { property: "og:description", content: "Build an invoice from inventory items with automatic totals." },
    ],
  }),
  component: NewInvoice,
});

function NewInvoice() {
  const navigate = useNavigate();
  const { displayName } = useAuth();
  const { currency, settings } = useSettings();

  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState<number | null>(null);
  const [items, setItems] = useState<LineItem[]>([
    { item_id: null, description: "", quantity: 1, unit_price: 0 },
  ]);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name").order("name");
      if (error) throw error;
      return data;
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

  const rate = taxRate ?? Number(settings?.default_tax_rate ?? 0);
  const totals = invoiceTotals(items, discount, rate);

  const save = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Please select a customer.");
      const valid = items.filter((l) => l.description.trim() && l.quantity > 0);
      if (!valid.length) throw new Error("Add at least one item.");
      if (discount < 0 || rate < 0) throw new Error("Discount and tax cannot be negative.");

      const number = await nextInvoiceNumber();
      const { data: inv, error } = await supabase
        .from("invoices")
        .insert({
          invoice_number: number,
          customer_id: customerId,
          issue_date: issueDate,
          due_date: dueDate || null,
          status: "Draft",
          subtotal: totals.subtotal,
          discount,
          tax_rate: rate,
          tax_amount: totals.tax_amount,
          total: totals.total,
          staff_name: displayName,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: e2 } = await supabase
        .from("invoice_items")
        .insert(valid.map((l) => ({ ...l, invoice_id: inv.id })));
      if (e2) throw e2;
      return inv.id as string;
    },
    onSuccess: (id) => {
      toast.success("Invoice created.");
      void navigate({ to: "/invoices/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/invoices">
          <ArrowLeft className="size-4" /> Back to invoices
        </Link>
      </Button>
      <PageHeader title="Create invoice" subtitle="Totals update as you type." />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Invoice details" className="lg:col-span-2">
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
              <FieldLabel>Issue date</FieldLabel>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </label>
            <label>
              <FieldLabel>Due date</FieldLabel>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>

          <div className="mt-4">
            <FieldLabel>Items</FieldLabel>
            <LineItemsEditor items={items} onChange={setItems} inventory={inventory} currency={currency} />
          </div>
        </SectionCard>

        <SectionCard title="Totals">
          <div className="space-y-3">
            <label>
              <FieldLabel>Discount ({currency})</FieldLabel>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
              />
            </label>
            <label>
              <FieldLabel>Tax rate (%)</FieldLabel>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={rate}
                onChange={(e) => setTaxRate(Math.max(0, Number(e.target.value)))}
              />
            </label>
            <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{formatMoney(totals.subtotal, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd>-{formatMoney(discount, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd>{formatMoney(totals.tax_amount, currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 font-display text-lg font-semibold">
                <dt>Total</dt>
                <dd>{formatMoney(totals.total, currency)}</dd>
              </div>
            </dl>
            <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
              Save invoice
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
