import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CUSTOMER_TYPES } from "@/lib/erp";
import { PageHeader, SectionCard, EmptyState, FieldLabel } from "@/components/erp/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/customers/")({
  head: () => ({
    meta: [
      { title: "Customers — Flower Industries Flower Shop ERP" },
      { name: "description", content: "Retail, corporate and event customer records with spend history." },
      { property: "og:title", content: "Customers — Flower Industries Flower Shop ERP" },
      { property: "og:description", content: "Manage flower shop customers, contacts and notes." },
    ],
  }),
  component: CustomersPage,
});

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  customer_type: string;
  notes: string | null;
};

const blank = {
  name: "",
  phone: "",
  email: "",
  address: "",
  customer_type: "Retail",
  notes: "",
};

function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("name");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ ...blank });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*");
      if (error) throw error;
      return data as Customer[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Customer name is required.");
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        customer_type: form.customer_type,
        notes: form.notes.trim() || null,
      };
      const { error } = editing
        ? await supabase.from("customers").update(payload).eq("id", editing.id)
        : await supabase.from("customers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editing ? "Customer updated." : "Customer added.");
      setOpen(false);
      setEditing(null);
      setForm({ ...blank });
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Customer deleted.");
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return customers
      .filter(
        (c) =>
          (type === "all" || c.customer_type === type) &&
          (!q ||
            c.name.toLowerCase().includes(q) ||
            c.phone.toLowerCase().includes(q) ||
            (c.email ?? "").toLowerCase().includes(q)),
      )
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name)
          : a.customer_type.localeCompare(b.customer_type),
      );
  }, [customers, search, type, sort]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...blank });
    setOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone,
      email: c.email ?? "",
      address: c.address ?? "",
      customer_type: c.customer_type,
      notes: c.notes ?? "",
    });
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Everyone who buys from the shop, in one list."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> Add customer
          </Button>
        }
      />

      <SectionCard>
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, phone or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {CUSTOMER_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort by name</SelectItem>
              <SelectItem value="type">Sort by type</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <EmptyState message="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState message="No customers match your search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Phone</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Address</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border/60">
                    <td className="py-2.5 pr-3 font-medium">
                      <Link
                        to="/customers/$id"
                        params={{ id: c.id }}
                        className="text-primary hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3">{c.phone || "—"}</td>
                    <td className="py-2.5 pr-3">{c.email || "—"}</td>
                    <td className="py-2.5 pr-3">{c.customer_type}</td>
                    <td className="max-w-56 truncate py-2.5 pr-3 text-muted-foreground">
                      {c.address || "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Delete ${c.name}?`)) remove.mutate(c.id);
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit customer" : "Add customer"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <FieldLabel>Name *</FieldLabel>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Phone</FieldLabel>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Email</FieldLabel>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>Address</FieldLabel>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            <label>
              <FieldLabel>Customer type</FieldLabel>
              <Select
                value={form.customer_type}
                onValueChange={(v) => setForm({ ...form, customer_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="sm:col-span-2">
              <FieldLabel>Notes</FieldLabel>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
