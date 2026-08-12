import { supabase } from "@/integrations/supabase/client";

export const ORDER_STATUSES = [
  "New",
  "Confirmed",
  "In Preparation",
  "Ready",
  "Delivered",
  "Picked Up",
  "Cancelled",
] as const;

export const INVOICE_STATUSES = ["Draft", "Sent", "Paid", "Partially Paid", "Overdue"] as const;
export const DELIVERY_STATUSES = ["Pending", "Out for Delivery", "Delivered", "Failed"] as const;
export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Card", "Other"] as const;
export const CUSTOMER_TYPES = ["Retail", "Corporate", "Event"] as const;
export const STOCK_IN_REASONS = ["New Purchase", "Return"] as const;
export const STOCK_OUT_REASONS = ["Sold", "Wastage", "Damaged", "Expired"] as const;
export const WASTAGE_REASONS = ["Wilted", "Damaged", "Expired", "Unsold", "Other"] as const;
export const UNITS = ["stems", "bunches", "pieces", "rolls", "metres"] as const;

export type LineItem = {
  item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
};

export function lineTotal(l: LineItem) {
  return Number(l.quantity || 0) * Number(l.unit_price || 0);
}

export function invoiceTotals(items: LineItem[], discount: number, taxRate: number) {
  const subtotal = items.reduce((s, l) => s + lineTotal(l), 0);
  const taxable = Math.max(0, subtotal - Number(discount || 0));
  const tax_amount = (taxable * Number(taxRate || 0)) / 100;
  return { subtotal, tax_amount, total: taxable + tax_amount };
}

export function invoiceStatusFor(total: number, paid: number, current: string, dueDate?: string | null) {
  if (paid >= total && total > 0) return "Paid";
  if (paid > 0) return "Partially Paid";
  if (dueDate && new Date(dueDate) < new Date(new Date().toDateString()) && current !== "Draft") {
    return "Overdue";
  }
  return current === "Paid" || current === "Partially Paid" ? "Sent" : current;
}

/** Reserves the next invoice number from settings and bumps the counter. */
export async function nextInvoiceNumber() {
  const { data, error } = await supabase
    .from("business_settings")
    .select("id,invoice_prefix,invoice_next_number")
    .limit(1)
    .maybeSingle();
  if (error || !data) throw error ?? new Error("Business settings not found");

  const number = `${data.invoice_prefix}${String(data.invoice_next_number).padStart(3, "0")}`;
  await supabase
    .from("business_settings")
    .update({ invoice_next_number: data.invoice_next_number + 1 })
    .eq("id", data.id);
  return number;
}

export async function recordStockMovement(params: {
  item_id: string;
  change: number;
  reason: string;
  note?: string;
  staff_name: string;
  current_stock: number;
}) {
  const newStock = Math.max(0, params.current_stock + params.change);
  const { error: e1 } = await supabase
    .from("inventory_items")
    .update({ current_stock: newStock })
    .eq("id", params.item_id);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("stock_movements").insert({
    item_id: params.item_id,
    change: params.change,
    reason: params.reason,
    note: params.note ?? null,
    staff_name: params.staff_name,
  });
  if (e2) throw e2;
  return newStock;
}
