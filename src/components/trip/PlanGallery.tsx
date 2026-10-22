import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { browsePlans } from "@/lib/trip.functions";
import type { PublicPlan } from "@/lib/public-plans";
import type { TripProfile } from "@/lib/trip-data";
import { mapUrl } from "@/lib/traveler";
export function PlanGallery({ viewer, onJoin }: { viewer?: TripProfile | undefined; onJoin: (id: string, sample: boolean) => void }) {
  const browse = useServerFn(browsePlans);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [local, setLocal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    browse({ data: viewer ? { viewer } : {} }).then((result) => { if (active) { setPlans(result.plans); setLocal(result.localOnly); } }).catch(() => { if (active) setError("Trips could not load. Please retry."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [browse, viewer, retry]);
  const filtered = plans.filter((plan) => plan.destinations.some((place) => place.toLowerCase().includes(search.trim().toLowerCase())));
  return <>
    <h1 className="text-3xl font-extrabold">Explore trips</h1>
    <p className="mt-2 text-sm text-muted-foreground">See plans across all breaks, even if your current preferences differ. See who’s planning each trip. Emails and private notes stay private.</p>
    {local && <p role="status" className="mt-3 rounded-xl bg-secondary p-3 text-sm">Local preview: these are sample trips, not live classmates’ plans.</p>}
    {!viewer && <p className="mt-3 text-sm text-primary">Save your preferences to see your personal plan-fit scores.</p>}
    <label className="mt-4 block text-sm font-semibold">Find a destination<input className="mt-2 h-12 w-full rounded-xl border-2 border-border bg-card px-3" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search all trips" /></label>
    {loading && <p role="status" className="mt-4">Loading trips…</p>}
    {error && <div role="alert" className="mt-4 text-sm text-destructive">{error}<button onClick={() => setRetry(retry + 1)} className="ml-3 underline">Retry</button></div>}
    {!loading && !error && !filtered.length && <p className="mt-4 text-sm text-muted-foreground">No plans found. Try a different destination.</p>}
    <div className="mt-5 space-y-5">{filtered.map((plan) => <article key={plan.id} className="trip-plan-card p-4">
      <p className="text-xs text-muted-foreground">{plan.firstName} · {plan.year} · {plan.sample ? "Sample trip" : "Trip"} · {plan.breakId}</p>
      <h2 className="mt-1 text-xl font-bold">{plan.destinations.join(" / ")}</h2>
      <p className="mt-1 text-sm">{plan.start} – {plan.end}</p><p className="mt-1 text-sm">${plan.budgetMin}–${plan.budgetMax} per person</p>
      {plan.score !== null && <p className="mt-3 font-semibold text-primary">{Math.round(plan.score)}% plan fit</p>}
      <p className="mt-1 text-sm text-muted-foreground">{plan.vibes.join(", ")}{plan.pace ? ` · ${plan.pace}` : ""}</p>
      {!!plan.items.length && <p className="mt-2 text-xs text-muted-foreground">Available: {plan.items.join(", ")}</p>}
      <div className="mt-4 flex items-center justify-between gap-3"><a href={mapUrl(plan.destinations[0] ?? "")} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary underline">View on Google Maps</a><button onClick={() => onJoin(plan.id, plan.sample)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{viewer ? "Request to join" : "Set preferences to join"}</button></div>
    </article>)}</div>
  </>;
}
