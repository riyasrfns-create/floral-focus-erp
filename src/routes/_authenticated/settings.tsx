import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, SectionCard, EmptyState, FieldLabel } from "@/components/erp/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Flower Industries Flower Shop ERP" },
      { name: "description", content: "Configure business details, currency, tax rate and invoice numbering." },
      { property: "og:title", content: "Settings — Flower Industries Flower Shop ERP" },
      { property: "og:description", content: "Owner-only business configuration for the florist ERP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { settings, isLoading } = useSettings();
  const { isOwner } = useAuth();
  const [form, setForm] = useState({
    business_name: "",
    address: "",
    phone: "",
    email: "",
    currency: "LKR",
    default_tax_rate: 0,
    invoice_prefix: "INV-2026-",
    invoice_next_number: 1,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        business_name: settings.business_name,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        currency: settings.currency,
        default_tax_rate: Number(settings.default_tax_rate),
        invoice_prefix: settings.invoice_prefix,
        invoice_next_number: Number(settings.invoice_next_number),
      });
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.business_name.trim()) throw new Error("Business name is required.");
      if (form.default_tax_rate < 0 || form.invoice_next_number < 1)
        throw new Error("Tax rate and invoice number must be positive.");
      if (!settings) throw new Error("Settings not found.");
      const { data, error } = await supabase
        .from("business_settings")
        .update(form)
        .eq("id", settings.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Save blocked — owner access required.");
    },
    onSuccess: () => {
      toast.success("Settings saved.");
      void qc.invalidateQueries({ queryKey: ["business_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isOwner) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Business configuration." />
        <SectionCard>
          <EmptyState message="Only the owner can change business settings." />
        </SectionCard>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Business details, currency and invoice numbering." />
      <SectionCard>
        {isLoading ? (
          <EmptyState message="Loading…" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <FieldLabel>Business name *</FieldLabel>
              <Input
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              />
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>Address</FieldLabel>
              <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Phone</FieldLabel>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Email</FieldLabel>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Currency code</FieldLabel>
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Default tax rate (%)</FieldLabel>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.default_tax_rate}
                onChange={(e) => setForm({ ...form, default_tax_rate: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label>
              <FieldLabel>Invoice prefix</FieldLabel>
              <Input
                value={form.invoice_prefix}
                onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })}
              />
            </label>
            <label>
              <FieldLabel>Next invoice number</FieldLabel>
              <Input
                type="number"
                min={1}
                value={form.invoice_next_number}
                onChange={(e) => setForm({ ...form, invoice_next_number: Math.max(1, Number(e.target.value)) })}
              />
            </label>
            <div className="sm:col-span-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                Save settings
              </Button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
