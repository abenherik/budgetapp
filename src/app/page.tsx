"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  EMPTY_STATE,
  STORAGE_KEY,
  buildShareUrl,
  createGoal,
  duplicateGoalForNextYear,
  evaluatePortfolio,
  formatAmount,
  formatDate,
  formatPercent,
  getFixedReserveSummary,
  getSharedStateFromSearch,
  parseBankBalanceInput,
  sanitizeState,
  type AppState,
  type GoalEvaluation,
} from "@/lib/savings";

type GoalFormState = {
  name: string;
  targetAmount: string;
  targetDate: string;
};

const EMPTY_FORM: GoalFormState = {
  name: "",
  targetAmount: "",
  targetDate: "",
};

export default function Home() {
  const [state, setState] = useState<AppState>(() => {
    if (typeof window === "undefined") {
      return EMPTY_STATE;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? sanitizeState(JSON.parse(raw)) : EMPTY_STATE;
    } catch {
      return EMPTY_STATE;
    }
  });
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [form, setForm] = useState<GoalFormState>(EMPTY_FORM);
  const [notice, setNotice] = useState<string | null>(null);
  const [bankBalanceInput, setBankBalanceInput] = useState<string>(String(EMPTY_STATE.bankBalance));
  const [shareUrl, setShareUrl] = useState<string>("");
  const formSectionRef = useRef<HTMLElement | null>(null);
  const fixedReserves = useMemo(() => getFixedReserveSummary(), []);
  const availableForGoals = Math.max(0, state.bankBalance - fixedReserves.total);
  const { goals, summary } = useMemo(
    () => evaluatePortfolio({ bankBalance: availableForGoals, goals: state.goals }),
    [availableForGoals, state.goals],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      console.warn("Kunne ikke gemme sparetilstand i localStorage.");
    }
  }, [state]);

  useEffect(() => {
    if (editingGoalId) {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editingGoalId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const sharedState = getSharedStateFromSearch(window.location.search);
    if (sharedState) {
      setState(sharedState);
      setNotice("Data hentet fra delingslinket på den anden telefon.");
    }
  }, []);

  useEffect(() => {
    if (bankBalanceInput !== "") {
      setBankBalanceInput(String(state.bankBalance));
    }
  }, [state.bankBalance]);

  function handleBankBalanceChange(value: string) {
    setBankBalanceInput(value);
  }

  function handleShareState() {
    if (typeof window === "undefined") {
      return;
    }

    const nextShareUrl = buildShareUrl(state, window.location.href);
    setShareUrl(nextShareUrl);

    navigator.clipboard?.writeText(nextShareUrl).catch(() => undefined);

    if (navigator.share) {
      navigator.share({
        title: "Sparkompas",
        text: "Åbn dette link for at hente de samme opsparingsmål på en anden telefon.",
        url: nextShareUrl,
      }).catch(() => undefined);
    }

    setNotice("Delingslinket er klar. Åbn det på den anden telefon for at hente samme data.");
  }

  function commitBankBalanceInput() {
    const nextValue = bankBalanceInput.trim();

    if (nextValue === "") {
      setState((current) => ({
        ...current,
        bankBalance: 0,
      }));
      setBankBalanceInput("");
      return;
    }

    const nextBalance = parseBankBalanceInput(nextValue);

    setState((current) => ({
      ...current,
      bankBalance: nextBalance,
    }));
    setBankBalanceInput(String(nextBalance));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const targetAmount = Number(form.targetAmount);
    const trimmedName = form.name.trim();

    if (!trimmedName || !form.targetDate || !Number.isFinite(targetAmount) || targetAmount <= 0) {
      setNotice("Indtast et målnavn, et positivt målbeløb og en måldato.");
      return;
    }

    if (editingGoalId) {
      setState((current) => ({
        ...current,
        goals: current.goals.map((goal) =>
          goal.id === editingGoalId
            ? {
                ...goal,
                name: trimmedName,
                targetAmount: Math.round(targetAmount),
                targetDate: form.targetDate,
              }
            : goal,
        ),
      }));
      setNotice(`Opdaterede ${trimmedName}.`);
    } else {
      setState((current) => ({
        ...current,
        goals: [...current.goals, createGoal({ name: trimmedName, targetAmount, targetDate: form.targetDate })],
      }));
      setNotice(`Tilføjede ${trimmedName}.`);
    }

    setForm(EMPTY_FORM);
    setEditingGoalId(null);
  }

  function startEditing(goal: GoalEvaluation) {
    setEditingGoalId(goal.id);
    setForm({
      name: goal.name,
      targetAmount: String(goal.targetAmount),
      targetDate: goal.targetDate,
    });
    setNotice(`Redigerer ${goal.name}.`);
  }

  function cancelEditing() {
    setEditingGoalId(null);
    setForm(EMPTY_FORM);
    setNotice(null);
  }

  function removeGoal(goalId: string) {
    setState((current) => ({
      ...current,
      goals: current.goals.filter((goal) => goal.id !== goalId),
    }));

    if (editingGoalId === goalId) {
      cancelEditing();
    }
    setNotice("Målet blev fjernet, og fordelingen blev beregnet på ny.");
  }

  function duplicateGoal(goalId: string) {
    setState((current) => ({
      ...current,
      goals: current.goals.flatMap((goal) =>
        goal.id === goalId ? [goal, duplicateGoalForNextYear(goal)] : [goal],
      ),
    }));
    const source = state.goals.find((goal) => goal.id === goalId);
    setNotice(source ? `Oprettede en kopi til næste år af ${source.name}.` : null);
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(251,191,36,.18),transparent_28%)]" />

      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/75 p-6 shadow-[0_20px_80px_-30px_rgba(15,23,42,.25)] backdrop-blur md:p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                Jola og Markus' Opsparing
              </span>
              <div className="space-y-3">
                <h1 className="display-font max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                  Hold vores mål på sporet
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                  Indtast bankens opsparing én gang, opret sparemål med målbeløb og datoer, og appen fordeler opsparingen mellem målene efter det månedlige behov, hvert mål kræver.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[34rem]">
              <StatCard label="Bankopsparing" value={formatAmount(state.bankBalance)} caption="Manuelt input fra din bankkonto" />
              <StatCard label="Fast post: realkredit" value={formatAmount(fixedReserves.mortgageReserve)} caption={`13.000 kr. pr. måned · ${fixedReserves.mortgageMonthsReserved} måned(er) reserveret`} />
              <StatCard label="Fast post: daglige udgifter" value={formatAmount(fixedReserves.groceryReserve)} caption={`${fixedReserves.groceryDaysRemaining} dag(e) tilbage · 350 kr. pr. dag`} />
              <StatCard label="Afsat til mål" value={formatAmount(summary.totalAllocated)} caption="Fordelt på opsparingsmål" />
              <StatCard label="Overskud" value={formatAmount(summary.remainingReserve)} caption="Bankopsparing efter faste poster og mål" />
            </div>
          </div>
        </section>

        <section className="grid gap-6">
          <article ref={formSectionRef} className="space-y-6 rounded-4xl border border-white/70 bg-white/80 p-6 shadow-[0_20px_80px_-35px_rgba(15,23,42,.24)] backdrop-blur md:p-7">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="display-font text-2xl font-semibold tracking-tight text-slate-950">Rediger bankopsparing eller tilføj et mål</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Når du ændrer saldoen, redigerer et mål, tilføjer et nyt mål eller fjerner et mål, beregnes fordelingen med det samme.
                </p>
              </div>
              <span className="text-xs font-medium text-slate-500">Gemt lokalt og delbart via sync-link</span>
            </div>

            {notice ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                {notice}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Aktuel bankopsparing
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={bankBalanceInput}
                  onChange={(event) => handleBankBalanceChange(event.target.value)}
                  onBlur={commitBankBalanceInput}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                  placeholder="F.eks. 500000"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-2 text-sm font-medium text-slate-700 md:col-span-1">
                  Målnavn
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                    placeholder="F.eks. Sommerferien 2032"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Målbeløb
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={form.targetAmount}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        targetAmount: event.target.value,
                      }))
                    }
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                    placeholder="F.eks. 150000"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Måldato
                  <input
                    type="date"
                    value={form.targetDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        targetDate: event.target.value,
                      }))
                    }
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {editingGoalId ? "Gem ændringer" : "Tilføj mål"}
                </button>

                {editingGoalId ? (
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Annuller redigering
                  </button>
                ) : null}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleShareState}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                >
                  Del sync-link
                </button>
              </div>

              {shareUrl ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-semibold">Synk-link</p>
                  <p className="mt-1 break-all text-xs text-slate-500">{shareUrl}</p>
                </div>
              ) : null}
            </form>
          </article>
        </section>

        <section className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_20px_80px_-35px_rgba(15,23,42,.22)] backdrop-blur md:p-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="display-font text-2xl font-semibold tracking-tight text-slate-950">Kompakt pace-graf</h2>
              <p className="text-sm leading-6 text-slate-600">
                Søjlerne sammenligner hvert måls månedlige behov med den andel af din aktuelle bankopsparing, som er fordelt til målet.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />
                Månedligt behov
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
                Tildelt andel
              </span>
            </div>
          </div>

          {goals.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-600">
              Tilføj et mål, så viser grafen hvordan det månedlige behov sammenlignes med den vægtede fordeling.
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {goals.map((goal) => (
                <CompactChartRow key={goal.id} goal={goal} maxNeed={summary.totalMonthlyNeed} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 pb-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="display-font text-2xl font-semibold tracking-tight text-slate-950">Mål</h2>
              <p className="text-sm leading-6 text-slate-600">
                Kortene beregnes automatisk igen, når du ændrer saldoen, tilføjer et mål, fjerner et mål eller justerer målbeløb eller dato.
              </p>
            </div>
            <p className="text-sm text-slate-500">
              Årlig ferie-arbejdsgang: slet en afsluttet rejse og kopier den til næste år.
            </p>
          </div>

          {goals.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center text-slate-600">
              Tilføj dit første sparemål for at se det månedlige behov og den vægtede fordeling.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
              {goals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  onEdit={() => startEditing(goal)}
                  onDelete={() => removeGoal(goal.id)}
                  onDuplicate={() => duplicateGoal(goal.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{caption}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  dark = false,
}: {
  label: string;
  value: string;
  helper: string;
  dark?: boolean;
}) {
  return (
    <div className={`rounded-3xl border p-4 ${dark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
      <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${dark ? "text-slate-400" : "text-slate-500"}`}>{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${dark ? "text-white" : "text-slate-950"}`}>{value}</p>
      <p className={`mt-2 text-sm leading-6 ${dark ? "text-slate-300" : "text-slate-600"}`}>{helper}</p>
    </div>
  );
}

function GoalCard({
  goal,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  goal: GoalEvaluation;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const isBehind = goal.status === "behind";
  const statusStyles = isBehind
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : goal.status === "completed"
      ? "border-sky-200 bg-sky-50 text-sky-700"
    : goal.status === "ahead"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <article
      className={`rounded-[1.75rem] border p-5 shadow-[0_12px_50px_-30px_rgba(15,23,42,.28)] ${
        isBehind ? "border-rose-200 bg-rose-50/80" : "border-slate-200 bg-white/90"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Måldato {formatDate(goal.targetDate)}
          </p>
          <h3 className="display-font mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {goal.name}
          </h3>
        </div>

        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${statusStyles}`}>
          {translateStatus(goal.status)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <InfoPill label="Mål" value={formatAmount(goal.targetAmount)} />
        <InfoPill label="Månedligt behov" value={formatAmount(goal.monthlyNeed)} />
        <InfoPill label="Tildelt andel" value={formatAmount(goal.allocatedAmount)} />
        <InfoPill label="Måneder tilbage" value={String(goal.monthsRemaining)} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
          <span>Fremdrift</span>
          <span>{formatPercent(goal.progressPercent)}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full ${isBehind ? "bg-rose-500" : goal.status === "completed" ? "bg-sky-500" : goal.status === "ahead" ? "bg-emerald-500" : "bg-amber-500"}`}
            style={{ width: `${Math.min(100, goal.progressPercent)}%` }}
          />
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-100">
        {goal.status === "completed" ? (
          <>Dette mål er opfyldt.</>
        ) : goal.status === "behind" ? (
          <>
            Dette mål har en samlet manko på {formatAmount(goal.shortfall)}.
          </>
        ) : goal.status === "ahead" ? (
          <>
            Dette mål er foran med {formatAmount(goal.paceDelta)} pr. måned.
          </>
        ) : (
          <>Dette mål ligger præcist på det krævede niveau.</>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <ActionButton label="Rediger" onClick={onEdit} />
        <ActionButton label="Kopiér +1 år" onClick={onDuplicate} />
        <ActionButton label="Slet" onClick={onDelete} destructive />
      </div>
    </article>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function CompactChartRow({
  goal,
  maxNeed,
}: {
  goal: GoalEvaluation;
  maxNeed: number;
}) {
  const widthBase = maxNeed > 0 ? Math.min(100, (goal.monthlyNeed / maxNeed) * 100) : 0;
  const allocationWidth = maxNeed > 0 ? Math.min(100, (goal.allocatedAmount / maxNeed) * 100) : 0;
  const isBehind = goal.status === "behind";

  return (
    <div className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 lg:grid-cols-[14rem_1fr_10rem] lg:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">{goal.name}</p>
        <p className="mt-1 text-xs text-slate-500">
          Behov {formatAmount(goal.monthlyNeed)} pr. måned · {translateStatus(goal.status)}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>Behov vs. fordeling</span>
          <span>{formatPercent(goal.progressPercent)}</span>
        </div>
        <div className="relative h-4 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${isBehind ? "bg-rose-500/35" : goal.status === "completed" ? "bg-sky-500/35" : "bg-amber-500/35"}`}
            style={{ width: `${widthBase}%` }}
          />
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${isBehind ? "bg-rose-500" : goal.status === "completed" ? "bg-sky-500" : "bg-teal-500"}`}
            style={{ width: `${allocationWidth}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm lg:text-right">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Tildelt</p>
          <p className="mt-1 font-semibold text-slate-950">{formatAmount(goal.allocatedAmount)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{goal.status === "completed" ? "Status" : "Manko"}</p>
          <p className={`mt-1 font-semibold ${isBehind ? "text-rose-700" : "text-slate-950"}`}>
            {goal.status === "completed" ? "Opfyldt" : goal.shortfall > 0 ? formatAmount(goal.shortfall) : "0 kr."}
          </p>
        </div>
      </div>
    </div>
  );
}

function translateStatus(status: GoalEvaluation["status"]) {
  if (status === "completed") {
    return "opfyldt";
  }

  if (status === "ahead") {
    return "foran";
  }

  if (status === "behind") {
    return "bagud";
  }

  return "på sporet";
}

function ActionButton({
  label,
  onClick,
  destructive = false,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        destructive
          ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}
