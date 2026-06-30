"use client";

import React from "react";
import { RotateCcw, Sliders, Store, Calculator } from "lucide-react";
import { useApp } from "@/store/AppContext";
import { SALONS } from "@/lib/mockData";
import { Card, CardBody, Button, NumberField, SectionTitle, Badge } from "@/components/ui/primitives";
import { money, rate, pct } from "@/lib/format";

export function AdminConfigPanel() {
  const { config, updateConfig, setSalonGuarantee, resetConfig } = useApp();

  // Live preview: a sample 8-hour day at a sample production level.
  const sampleProduction = 560;
  const sampleHours = 8;
  const commissionPay = sampleProduction * config.commissionRate;
  const guaranteePay = sampleHours * config.guaranteeRate;
  const samplePay = Math.max(commissionPay, guaranteePay);
  const sampleRate = samplePay / sampleHours;
  const avgTicket = config.serviceMixHaircut * config.avgTicketHaircut + (1 - config.serviceMixHaircut) * config.avgTicketColor;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex items-start justify-between">
            <SectionTitle hint="Drives every dashboard & planner live">
              <span className="inline-flex items-center gap-2 normal-case">
                <Calculator size={16} className="text-[var(--color-brand)]" /> Pay calculation engine
              </span>
            </SectionTitle>
            <Button variant="ghost" size="sm" onClick={resetConfig}>
              <RotateCcw size={14} /> Reset
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField
              label="Base guarantee rate"
              value={config.guaranteeRate}
              onChange={(v) => updateConfig({ guaranteeRate: v })}
              prefix="$"
              suffix="/hr"
              step={0.5}
              hint="Global floor when a salon has no override"
            />
            <NumberField
              label="Commission rate"
              value={Math.round(config.commissionRate * 100)}
              onChange={(v) => updateConfig({ commissionRate: v / 100 })}
              suffix="%"
              step={1}
              hint="Share of production paid out"
            />
            <NumberField
              label="Min expected services / day"
              value={config.minServicesPerDay}
              onChange={(v) => updateConfig({ minServicesPerDay: v })}
              step={1}
              hint="Used for feasibility checks"
            />
            <NumberField
              label="Avg ticket · Haircut"
              value={config.avgTicketHaircut}
              onChange={(v) => updateConfig({ avgTicketHaircut: v })}
              prefix="$"
              step={1}
            />
            <NumberField
              label="Avg ticket · Color"
              value={config.avgTicketColor}
              onChange={(v) => updateConfig({ avgTicketColor: v })}
              prefix="$"
              step={1}
            />
            <NumberField
              label="Default service mix (haircuts)"
              value={Math.round(config.serviceMixHaircut * 100)}
              onChange={(v) => updateConfig({ serviceMixHaircut: Math.max(0, Math.min(100, v)) / 100 })}
              suffix="%"
              step={5}
              hint="Rest assumed color services"
            />
          </div>
        </CardBody>
      </Card>

      {/* Per-salon guarantees */}
      <Card>
        <CardBody>
          <SectionTitle hint="Override the global floor">
            <span className="inline-flex items-center gap-2 normal-case">
              <Store size={16} className="text-[var(--color-brand)]" /> Per-salon guarantee rates
            </span>
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3">
            {SALONS.map((s) => (
              <NumberField
                key={s.id}
                label={`${s.name}`}
                value={config.salonGuarantee[s.id] ?? config.guaranteeRate}
                onChange={(v) => setSalonGuarantee(s.id, v)}
                prefix="$"
                suffix="/hr"
                step={0.5}
              />
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Live preview */}
      <Card className="border-transparent bg-[var(--color-brand-soft)]">
        <CardBody>
          <div className="flex items-center gap-2">
            <Sliders size={16} className="text-[var(--color-brand-ink)]" />
            <h3 className="text-sm font-semibold text-[var(--color-brand-ink)]">Live formula preview</h3>
          </div>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Sample day: {money(sampleProduction)} production over {sampleHours}h.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Preview label="Commission pay" value={money(commissionPay)} />
            <Preview label="Guarantee pay" value={money(guaranteePay)} />
            <Preview label="Effective rate" value={`${rate(sampleRate)}/hr`} highlight />
            <Preview label="Planner avg ticket" value={money(avgTicket)} />
          </div>
          <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
            Pay = <b>max(production × {pct(config.commissionRate)}, hours × guarantee)</b>. Required production to hit a target rate
            ={" "}
            <b>target × hours ÷ {pct(config.commissionRate)}</b>.{" "}
            <Badge tone="brand">Changes apply instantly app-wide</Badge>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Preview({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${highlight ? "bg-[var(--color-brand)] text-white" : "bg-[var(--color-surface)]"}`}>
      <div className={`text-[11px] font-medium uppercase ${highlight ? "text-white/80" : "text-[var(--color-ink-faint)]"}`}>{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
