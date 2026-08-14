import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard } from "@/components/erp/ui";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({
    meta: [
      { title: "Help & Guide — Flower Industries Flower Shop ERP" },
      { name: "description", content: "Step-by-step guide for daily flower shop tasks: orders, invoices, stock and reports." },
      { property: "og:title", content: "Help & Guide — Flower Industries Flower Shop ERP" },
      { property: "og:description", content: "Simple daily instructions for shop staff using the florist ERP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HelpPage,
});

const SECTIONS = [
  {
    title: "Daily routine",
    steps: [
      "Open the Dashboard to see today's orders, deliveries and low-stock alerts.",
      "Record new flower arrivals in Flower Management so freshness tracking starts.",
      "Log any wilted or damaged flowers under Log wastage before closing.",
    ],
  },
  {
    title: "Taking an order",
    steps: [
      "Go to Customers and add the customer if they are new.",
      "Open Orders → New order, pick the customer, add line items and the requested date.",
      "Update the order status as it moves from New to Ready and finally Delivered or Picked Up.",
    ],
  },
  {
    title: "Invoices and payments",
    steps: [
      "From an order detail page use Convert to invoice, or create one from Invoices → New invoice.",
      "Record each payment on the invoice page; the status updates to Partially Paid or Paid automatically.",
      "Use Print to produce a PDF copy for the customer.",
    ],
  },
  {
    title: "Stock",
    steps: [
      "Inventory holds non-perishable items and general stock levels.",
      "Items at or below their reorder level are flagged as Low stock.",
      "Adjust quantities by editing the item after a stock count.",
    ],
  },
  {
    title: "Reports",
    steps: [
      "Sales, Deliveries and Wastage pages each have filters and an Export CSV button.",
      "Use Print on report pages to save a PDF.",
      "Financial reports and Settings are available to the owner only.",
    ],
  },
];

function HelpPage() {
  return (
    <div>
      <PageHeader title="Help & Guide" subtitle="Short instructions for everyday tasks." />
      <div className="grid gap-4 lg:grid-cols-2">
        {SECTIONS.map((s) => (
          <SectionCard key={s.title} title={s.title}>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              {s.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
