import { Trash2, Plus } from "lucide-react";
import type { LineItem } from "@/lib/erp";
import { lineTotal } from "@/lib/erp";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type InventoryOption = {
  id: string;
  name: string;
  unit: string;
  selling_price: number;
};

export function LineItemsEditor({
  items,
  onChange,
  inventory,
  currency,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  inventory: InventoryOption[];
  currency: string;
}) {
  const update = (i: number, patch: Partial<LineItem>) =>
    onChange(items.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-2">
      {items.map((l, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <Select
              value={l.item_id ?? "custom"}
              onValueChange={(v) => {
                if (v === "custom") {
                  update(i, { item_id: null });
                  return;
                }
                const inv = inventory.find((x) => x.id === v);
                update(i, {
                  item_id: v,
                  description: inv?.name ?? l.description,
                  unit_price: Number(inv?.selling_price ?? 0),
                });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select item" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom item</SelectItem>
                {inventory.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.name} ({inv.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            className="sm:col-span-3"
            placeholder="Description"
            value={l.description}
            onChange={(e) => update(i, { description: e.target.value })}
          />
          <Input
            className="sm:col-span-1"
            type="number"
            min={1}
            step="1"
            value={l.quantity}
            onChange={(e) => update(i, { quantity: Math.max(0, Number(e.target.value)) })}
          />
          <Input
            className="sm:col-span-2"
            type="number"
            min={0}
            step="0.01"
            value={l.unit_price}
            onChange={(e) => update(i, { unit_price: Math.max(0, Number(e.target.value)) })}
          />
          <div className="flex items-center justify-between gap-2 sm:col-span-1">
            <span className="text-xs text-muted-foreground sm:hidden">Line total</span>
            <span className="text-sm font-medium">{formatMoney(lineTotal(l), currency)}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              aria-label="Remove line"
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, { item_id: null, description: "", quantity: 1, unit_price: 0 }])}
      >
        <Plus className="size-4" /> Add line
      </Button>
    </div>
  );
}
