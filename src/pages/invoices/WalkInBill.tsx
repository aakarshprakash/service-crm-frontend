import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Package, PenLine, Wrench } from "lucide-react";
import { UpiQrDialog } from "@/components/upi";
import { api, ApiError, type Envelope, type Paginated } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { useLookups } from "@/lib/hooks";
import { toMajor, toMinor } from "@/lib/format";
import type { Customer, InventoryItem, Invoice } from "@/lib/types";
import {
  Avatar,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  SearchInput,
  Select,
  Textarea,
  toast,
} from "@/components/ui";
import { Hint } from "@/components/tutorial";
import { lineTaxes } from "@/pages/estimates/estimateParts";
import {
  BillLines,
  PartPicker,
  lineTotal,
  newLineKey,
  type BillLine,
} from "./walkin/BillLines";
import { Choice, Payment, Summary, type Figures } from "./walkin/BillSide";

const blankService = (): BillLine => ({
  key: newLineKey(),
  type: "service",
  item: null,
  description: "",
  quantity: "1",
  unit_price: "",
  gst_rate: null,
});

/** Counter bill for a walk-in customer: services and/or parts sold from branch stock, paid at the counter. */
export default function WalkInBill() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: lookups } = useLookups();
  const billing = lookups?.billing;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });
  const [branchId, setBranchId] = useState(
    user?.branch_id ? String(user.branch_id) : "",
  );
  const [lines, setLines] = useState<BillLine[]>([blankService()]);
  const [picking, setPicking] = useState(false);
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  // Null: follow Settings until someone chooses.
  const [gstChoice, setGstChoice] = useState<boolean | null>(null);
  const [inclusiveChoice, setInclusiveChoice] = useState<boolean | null>(null);
  const [method, setMethod] = useState("cash");
  const [paid, setPaid] = useState<string | null>(null); // null = follow the bill total
  const [reference, setReference] = useState("");
  const [showUpi, setShowUpi] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  const gstRegistered = !!billing?.gst_registered;
  const isGst = gstChoice ?? billing?.walkin_bills !== "non_gst";
  const inclusive = inclusiveChoice ?? billing?.walkin_prices !== "before_gst";
  const mode =
    !gstRegistered || !isGst ? "none" : inclusive ? "inclusive" : "exclusive";

  // Each line's GST rate: its own if chosen, else the part's rate, else Settings → GST (as the server works it out).
  const rateOf = (l: BillLine) =>
    l.gst_rate ??
    (l.type === "part"
      ? Number(l.item?.gst_rate ?? billing?.part_rate ?? 18)
      : Number(billing?.service_rate ?? 18));
  const discountMinor = toMinor(discount);
  const taxes = lineTaxes(
    lines.map((l) => ({ gross: lineTotal(l), rate: rateOf(l) })),
    discountMinor,
    { on: mode !== "none", inclusive: mode === "inclusive" },
  );
  const figures = billFigures(lines, taxes, discountMinor, rateOf);
  const total = Math.max(0, figures.total);
  const paidMinor =
    method === "credit" ? 0 : paid === null ? total : toMinor(paid);
  const balance = total - paidMinor;

  const update = (key: number, patch: Partial<BillLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: number) =>
    setLines((ls) => ls.filter((l) => l.key !== key));
  const addService = () => setLines((ls) => [...ls, blankService()]);
  // A part not kept in stock: typed in by name and price, like an estimate line.
  const addTypedPart = (name: string) => {
    setLines((ls) => [...ls, { ...blankService(), type: "part", description: name }]);
    setPicking(false);
  };
  const addPart = (item: InventoryItem) => {
    setLines((ls) => [
      ...ls,
      {
        key: newLineKey(),
        type: "part",
        item,
        description: "",
        quantity: "1",
        unit_price: toMajor(item.unit_price) || "0",
        gst_rate: null,
      },
    ]);
    setPicking(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<Envelope<Invoice> & { message?: string }>(
        "/walk-in-bills",
        {
          customer_id: customer?.id ?? null,
          customer: customer
            ? null
            : {
                name: newCustomer.name.trim(),
                phone: newCustomer.phone.trim(),
              },
          branch_id: branchId ? Number(branchId) : null,
          items: lines.map((l) => ({
            type: l.type,
            item_id: l.item?.id ?? null,
            description: l.description.trim() || null,
            quantity: parseFloat(l.quantity) || 0,
            unit_price: l.unit_price === "" ? null : toMinor(l.unit_price),
            gst_rate: mode !== "none" ? l.gst_rate : null,
          })),
          discount: discountMinor || null,
          notes: notes.trim() || null,
          is_gst: gstRegistered ? isGst : null,
          prices_include_gst: mode !== "none" ? inclusive : null,
          payment_method: method,
          amount_paid: method === "credit" ? null : paidMinor,
          reference_no: reference.trim() || null,
        },
      );
      toast.success(res.message ?? "Bill created.");
      navigate(`/invoices/${res.data.id}`);
    } catch (err) {
      const apiErr =
        err instanceof ApiError
          ? err
          : new ApiError(0, "Something went wrong.");
      setError(apiErr);
      const shown = [
        "customer.name",
        "customer.phone",
        "reference_no",
        "discount",
        "branch_id",
        "amount_paid",
      ];
      if (
        !Object.keys(apiErr.errors).some(
          (k) => shown.includes(k) || k.startsWith("items."),
        )
      )
        toast.error(apiErr.message);
    } finally {
      setSaving(false);
    }
  };

  const f = (n: string) => error?.field(n);
  const lineError = (i: number) =>
    ["description", "item_id", "quantity", "unit_price", "gst_rate"]
      .map((k) => f(`items.${i}.${k}`))
      .find(Boolean);
  const branches = lookups?.branches ?? [];

  return (
    <form onSubmit={submit}>
      <PageHeader
        back={
          <Link
            to="/invoices?source=walk_in"
            className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" /> Invoices
          </Link>
        }
        title="New invoice"
        description="Bill a customer at the counter for a repair or parts sold. Parts are taken out of the branch’s stock."
      />

      {/* Laid out like the bill it makes: who it is for, the lines across the page, then the totals and payment. */}
      <div className="space-y-6">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <CustomerCard
            customer={customer}
            onCustomer={setCustomer}
            draft={newCustomer}
            onDraft={setNewCustomer}
            errorOf={f}
          />
          {(gstRegistered || branches.length > 1) && (
            <Card title="Bill settings">
              <div className="space-y-4">
                {gstRegistered && (
                  <Field
                    label="Tax"
                    error={f("is_gst") ?? f("prices_include_gst")}
                    hint={taxHint(mode)}
                  >
                    <Choice
                      label="Bill type"
                      value={isGst}
                      onChange={setGstChoice}
                      options={[
                        [true, "GST bill"],
                        [false, "Non-GST bill"],
                      ]}
                    />
                    {isGst && (
                      <div className="mt-2">
                        <Choice
                          label="How GST is counted"
                          value={inclusive}
                          onChange={setInclusiveChoice}
                          options={[
                            [false, "GST exclusive"],
                            [true, "GST inclusive"],
                          ]}
                        />
                      </div>
                    )}
                  </Field>
                )}
                {branches.length > 1 && (
                  <Field
                    label="Branch"
                    error={f("branch_id")}
                    hint="Parts are taken from this branch’s stock."
                  >
                    <Select
                      value={branchId}
                      onChange={(e) => setBranchId(e.target.value)}
                    >
                      <option value="">Default</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
            </Card>
          )}
        </div>

        <Card
          title="Items"
          padded={false}
          actions={
            <>
              <Button
                size="sm"
                variant="secondary"
                icon={<Wrench className="h-4 w-4" />}
                onClick={addService}
              >
                Add service
              </Button>
              {/* Typing comes first, as on an estimate; picking from stock is the second way in. */}
              <Button
                size="sm"
                variant="secondary"
                icon={<PenLine className="h-4 w-4" />}
                onClick={() => addTypedPart("")}
              >
                Add part
              </Button>
              <Hint text="Search your spare parts and add one to the bill. When the bill is saved, the quantity is taken out of the selected branch’s stock.">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Package className="h-4 w-4" />}
                  onClick={() => setPicking(true)}
                >
                  From stock
                </Button>
              </Hint>
            </>
          }
        >
          {(f("items") || f("quantity")) && (
            <p className="px-5 pt-3 text-xs text-red-600">
              {f("items") ?? f("quantity")}
            </p>
          )}
          {picking && (
            <PartPicker
              branchId={branchId}
              onPick={addPart}
              onType={addTypedPart}
              onClose={() => setPicking(false)}
            />
          )}
          {lines.length ? (
            <BillLines
              lines={lines}
              isGst={mode !== "none"}
              inclusive={mode === "inclusive"}
              rateOf={rateOf}
              taxes={taxes}
              discounted={discountMinor > 0}
              errorOf={lineError}
              onChange={update}
              onRemove={remove}
            />
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-slate-900">
                Nothing on the bill yet
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Add the service you did, or a part sold from stock.
              </p>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <Card title="Note on the bill" className="self-start">
            <Textarea
              rows={3}
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional, e.g. warranty or what was agreed. Printed on the bill."
            />
          </Card>
          <Summary
            figures={figures}
            mode={mode}
            discount={discount}
            onDiscount={setDiscount}
            discountError={f("discount")}
          />
        </div>

        <Payment
          method={method}
          onMethod={setMethod}
          paid={paid}
          onPaid={setPaid}
          total={total}
          balance={balance}
          reference={reference}
          onReference={setReference}
          errorOf={f}
          onShowUpi={() => setShowUpi(true)}
          saving={saving}
          canSubmit={lines.length > 0 && balance >= 0}
        />
      </div>
      <UpiQrDialog
        open={showUpi}
        onClose={() => setShowUpi(false)}
        amount={paidMinor}
        note="Walk-in bill"
        branchId={branchId ? Number(branchId) : user?.branch_id}
      />
    </form>
  );
}

function taxHint(mode: "none" | "exclusive" | "inclusive"): string {
  if (mode === "none")
    return "No GST is shown on this bill. The customer pays the prices as typed.";
  return mode === "inclusive"
    ? "The prices already contain GST. The bill shows the tax inside them."
    : "GST is added on top of the prices and shown on the bill.";
}

/** The bill's figures from its lines: services and parts as typed, then taxable value and GST (by rate) after the discount. */
function billFigures(
  lines: BillLine[],
  taxes: { taxable: number; tax: number }[],
  discount: number,
  rateOf: (l: BillLine) => number,
): Figures {
  const sum = (type: BillLine["type"]) =>
    lines.filter((l) => l.type === type).reduce((a, l) => a + lineTotal(l), 0);
  const byRate = new Map<number, number>();
  lines.forEach((l, i) => {
    const tax = taxes[i]?.tax ?? 0;
    if (tax) byRate.set(rateOf(l), (byRate.get(rateOf(l)) ?? 0) + tax);
  });
  const taxable = taxes.reduce((a, t) => a + t.taxable, 0);
  const tax = taxes.reduce((a, t) => a + t.tax, 0);
  return {
    services: sum("service"),
    parts: sum("part"),
    discount,
    taxable,
    tax,
    total: taxable + tax,
    byRate: [...byRate]
      .sort(([a], [b]) => a - b)
      .map(([rate, t]) => ({ rate, tax: t })),
  };
}

/** Who the bill is for: a new customer by phone and name, or one already on the books. */
function CustomerCard({
  customer,
  onCustomer,
  draft,
  onDraft,
  errorOf,
}: {
  customer: Customer | null;
  onCustomer: (c: Customer | null) => void;
  draft: { name: string; phone: string };
  onDraft: (d: { name: string; phone: string }) => void;
  errorOf: (field: string) => string | undefined;
}) {
  const [existing, setExisting] = useState(false);
  const [search, setSearch] = useState("");
  const results = useQuery({
    queryKey: ["customer-search", search],
    queryFn: () =>
      api.get<Paginated<Customer>>("/customers", { search, per_page: 6 }),
    enabled: existing && search.length >= 2 && !customer,
  });

  if (customer) {
    return (
      <Card title="Customer">
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <Avatar name={customer.name} className="h-10 w-10 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-slate-900">
              {customer.name}
            </p>
            <p className="truncate text-sm text-slate-500">
              {[
                customer.phone,
                customer.city,
                customer.gstin && `GSTIN ${customer.gstin}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onCustomer(null)}>
            Change
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Customer"
      actions={
        <div className="w-44 sm:w-64">
          <Choice
            label="Customer"
            value={existing}
            onChange={setExisting}
            options={[
              [false, "New"],
              [true, "Existing"],
            ]}
          />
        </div>
      }
    >
      {existing ? (
        <div className="space-y-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name or phone"
            delay={250}
          />
          {search.length >= 2 && (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {results.data?.data.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => onCustomer(c)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <Avatar name={c.name} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {c.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">
                    {c.phone}
                  </span>
                </button>
              ))}
              {results.data && !results.data.data.length && (
                <p className="px-3 py-4 text-center text-sm text-slate-500">
                  No customer matches “{search}”.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" required error={errorOf("customer.phone")}>
              <Input
                inputMode="tel"
                value={draft.phone}
                maxLength={16}
                onChange={(e) =>
                  onDraft({
                    ...draft,
                    phone: e.target.value.replace(/[^\d+]/g, ""),
                  })
                }
              />
            </Field>
            <Field label="Name" required error={errorOf("customer.name")}>
              <Input
                value={draft.name}
                maxLength={150}
                onChange={(e) => onDraft({ ...draft, name: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            If this phone number already belongs to a customer, the bill is
            added to that customer.
          </p>
        </div>
      )}
    </Card>
  );
}
