import type { ReactNode } from "react";
import { QrCode } from "lucide-react";
import { money, toMajor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button, Field, Input } from "@/components/ui";

/** A two-way switch, e.g. GST bill or not, and whether the prices include GST. */
export function Choice<T extends string | boolean>({
  label,
  value,
  onChange,
  options,
  columns = 2,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, string])[];
  /** 5: one row on wider screens, three across on phones. */
  columns?: 2 | 5;
}) {
  return (
    <div
      className={cn(
        "grid gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1",
        columns === 5 ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2",
      )}
      role="radiogroup"
      aria-label={label}
    >
      {options.map(([v, text]) => (
        <button
          key={text}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-md px-2 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
            value === v
              ? "bg-white text-brand-700 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Row({ k, v, muted }: { k: ReactNode; v: ReactNode; muted?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4",
        muted ? "text-slate-500" : "text-slate-700",
      )}
    >
      <dt>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}

export interface Figures {
  services: number;
  parts: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
  /** GST by rate, for "GST @ 18%" lines. */
  byRate: { rate: number; tax: number }[];
}

/**
 * The bill's figures in the order they print, ending in what the customer pays.
 * GST exclusive: subtotal, discount, taxable value, GST by rate, total including GST.
 * GST inclusive: the total stays as typed and the GST inside it is said underneath.
 */
export function Summary({
  figures: x,
  mode,
  discount,
  onDiscount,
  discountError,
}: {
  figures: Figures;
  mode: "none" | "exclusive" | "inclusive";
  discount: string;
  onDiscount: (v: string) => void;
  discountError?: string;
}) {
  const subtotal = x.services + x.parts;
  return (
    <section
      aria-label="Bill summary"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card"
    >
      <dl className="space-y-2.5 px-5 pb-4 pt-5 text-sm">
        {x.services > 0 && x.parts > 0 && (
          <>
            <Row k="Services" v={money(x.services)} muted />
            <Row k="Parts" v={money(x.parts)} muted />
          </>
        )}
        <Row k="Subtotal" v={money(subtotal)} />
        <div className="flex items-center justify-between gap-4">
          <dt>
            <label htmlFor="walkin-discount" className="text-slate-700">
              Discount
            </label>
            {discountError && (
              <p className="text-xs text-red-600">{discountError}</p>
            )}
          </dt>
          <dd className="relative w-32">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
              ₹
            </span>
            <Input
              id="walkin-discount"
              inputMode="decimal"
              placeholder="0"
              value={discount}
              invalid={!!discountError}
              className="h-9 pl-7 text-right tabular-nums"
              onChange={(e) =>
                onDiscount(e.target.value.replace(/[^\d.]/g, ""))
              }
            />
          </dd>
        </div>
        {mode === "exclusive" && (
          <>
            <Row k="Taxable value" v={money(x.taxable)} />
            {x.byRate.map((r) => (
              <Row key={r.rate} k={`GST @ ${r.rate}%`} v={money(r.tax)} muted />
            ))}
          </>
        )}
      </dl>
      {/* What the customer pays: the one figure that matters at the counter. */}
      <div className="bg-navy-900 px-5 py-4 text-white">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-sm font-medium text-slate-300">
            {mode === "exclusive" ? "Total including GST" : "Total"}
          </span>
          <span className="text-2xl font-bold tabular-nums">
            {money(x.total)}
          </span>
        </div>
        {mode === "inclusive" && x.tax > 0 && (
          <p className="mt-1 text-right text-xs text-slate-400">
            Includes GST {money(x.tax)} on a taxable value of {money(x.taxable)}
          </p>
        )}
      </div>
    </section>
  );
}

const METHODS = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["cheque", "Cheque"],
  ["bank_transfer", "Bank"],
  ["credit", "Pay later"],
] as const;

/** How the customer pays now, the change in balance, and the button that makes the bill. */
export function Payment({
  method,
  onMethod,
  paid,
  onPaid,
  total,
  balance,
  reference,
  onReference,
  errorOf,
  onShowUpi,
  saving,
  canSubmit,
}: {
  method: string;
  onMethod: (m: string) => void;
  paid: string | null;
  onPaid: (v: string) => void;
  total: number;
  balance: number;
  reference: string;
  onReference: (v: string) => void;
  errorOf: (field: string) => string | undefined;
  onShowUpi: () => void;
  saving: boolean;
  canSubmit: boolean;
}) {
  const credit = method === "credit";
  const received = total - balance;
  const needsRef =
    ["upi", "cheque", "bank_transfer"].includes(method) && received > 0;
  return (
    <section
      aria-label="Payment"
      className="rounded-xl border border-slate-200 bg-white shadow-card"
    >
      <header className="border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-slate-900">Payment</h2>
      </header>
      {/* Wide screens: how they pay on the left, the outcome and the button on the right. */}
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6">
        <div className="space-y-4">
          <Choice<string>
            label="How the customer pays"
            value={method}
            onChange={onMethod}
            options={METHODS}
            columns={5}
          />
          {credit ? (
            <p className="text-sm text-slate-600">
              The full amount is added to the customer’s balance, to be paid
              later.
            </p>
          ) : (
            <Field
              label="Amount received"
              error={errorOf("amount_paid") ?? errorOf("amount")}
            >
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
                  ₹
                </span>
                <Input
                  inputMode="decimal"
                  className="pl-7 tabular-nums"
                  value={paid ?? toMajor(total)}
                  onChange={(e) =>
                    onPaid(e.target.value.replace(/[^\d.]/g, ""))
                  }
                />
              </div>
            </Field>
          )}
          {method === "upi" && received > 0 && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              icon={<QrCode className="h-4 w-4" />}
              onClick={onShowUpi}
            >
              Show UPI QR for {money(received)}
            </Button>
          )}
          {needsRef && (
            <Field
              label={
                method === "cheque"
                  ? "Cheque number"
                  : method === "upi"
                    ? "UPI transaction ref. (optional)"
                    : "Bank reference / UTR"
              }
              required={method !== "upi"}
              error={errorOf("reference_no")}
            >
              <Input
                value={reference}
                maxLength={100}
                onChange={(e) => onReference(e.target.value)}
              />
            </Field>
          )}
        </div>
        <div className="flex flex-col justify-end gap-3">
          <div
            className={cn(
              "flex items-baseline justify-between rounded-lg px-4 py-3 text-sm",
              balance > 0
                ? "bg-amber-50 text-amber-900"
                : balance < 0
                  ? "bg-red-50 text-red-800"
                  : "bg-emerald-50 text-emerald-900",
            )}
          >
            <span>
              {balance > 0
                ? "Balance due"
                : balance < 0
                  ? "More than the bill"
                  : "Fully paid"}
            </span>
            <span className="text-base font-semibold tabular-nums">
              {money(Math.abs(balance))}
            </span>
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={saving}
            disabled={!canSubmit}
          >
            Create bill · {money(total)}
          </Button>
        </div>
      </div>
    </section>
  );
}
