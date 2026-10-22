import { readDemoTrip, type TripData } from "@/lib/local-demo";
import { GroupPersonality } from "@/components/trip/Personality";
import { TravelerChat } from "@/components/trip/TravelerChat";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Screen } from "@/components/trip/ui";
import { decide, getItinerary } from "@/lib/trip.functions";

export const Route = createFileRoute("/trip/$id")({
  head: () => ({
    meta: [
      { title: "Shared itinerary — TripMatch" },
      { name: "description", content: "Your shared day-by-day trip plan, travelers and cost split." },
      { property: "og:title", content: "Shared itinerary — TripMatch" },
      { property: "og:description", content: "Your shared day-by-day trip plan, travelers and cost split." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TripPage,
});

type Data = TripData;
const fmt = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function TripPage() {
  const { id } = Route.useParams();
  const load = useServerFn(getItinerary);
  const decision = useServerFn(decide);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const local = readDemoTrip(id);
    if (local) { setData(local); return; }
    load({ data: { proposalId: id } }).then((result) => { if (active) setData(result); }).catch(() => { if (active) setErr("This plan could not load. Please check your sign-in and try again."); });
    return () => { active = false; };
  }, [id, load]);

  if (err && !data) return <Screen><p role="alert" className="text-destructive">{err}</p><Link to="/" className="mt-5 text-primary underline">Return home</Link></Screen>;
  if (!data) return <Screen><p className="text-muted-foreground">Loading trip…</p></Screen>;
  const { merged, travelers, itinerary } = data;
  const matched = data.status === "accepted";
  async function accept() {
    setBusy(true); setErr(null);
    try { await decision({ data: { proposalId: id, status: "accepted" } }); setData(await load({ data: { proposalId: id } })); }
    catch { setErr("Your acceptance could not be saved. Please retry."); }
    finally { setBusy(false); }
  }
  return (
    <Screen step={data.isDemo ? "Demo plan confirmed" : matched ? "Matched" : "Awaiting mutual match"} assistantContext={JSON.stringify({ destination: merged.destination, start: merged.start_date, end: merged.end_date })}>
      {data.isDemo && <p role="status" className="mb-4 text-sm text-muted-foreground">Device-only demonstration with a sample traveler. No real person has joined this trip.</p>}
      {!matched && <section className="mb-4 rounded-xl border border-border bg-card p-4"><h2 className="font-bold">Both travelers must accept</h2><p className="mt-2 text-sm text-muted-foreground">Profiles, private notes and chat stay locked until both people accept this plan.</p>{data.status !== "passed" && data.viewerId && !data.acceptedBy.includes(data.viewerId) ? <button disabled={busy} onClick={() => void accept()} className="mt-3 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">{busy ? "Saving…" : "Accept this plan"}</button> : <p className="mt-2 text-sm">{data.status === "passed" ? "This plan is closed." : "Your acceptance is saved. Waiting for the other traveler."}</p>}</section>}
      {err && <p role="alert" className="mb-3 text-sm text-destructive">{err}</p>}
      <div className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-card">
        <div className="text-xs font-semibold uppercase tracking-widest opacity-80">{matched ? "Shared plan" : "Proposed destination"}</div>
        <h1 className="mt-1 text-3xl font-extrabold text-primary-foreground">{merged.destination}</h1>
        <div className="opacity-90">{fmt(merged.start_date)} – {fmt(merged.end_date)}</div>
      </div>
      <h2 className="mt-6 mb-2 text-lg font-bold">Who's going</h2>
      <div className="flex flex-wrap gap-2">
        {travelers.map((t, i) => (
          <span key={t.id} className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold">{t.id === data.viewerId ? `${t.first_name} (you)` : t.first_name} · {t.msba_year}</span>
        ))}
      </div>
      <h2 className="mt-6 mb-2 text-lg font-bold">Day by day</h2>
      <ol className="space-y-2">
        {itinerary.days.map((d, i) => (
          <li key={d.date} className="flex gap-3 rounded-2xl bg-card p-3 shadow-card">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-accent-foreground">{i + 1}</span>
            <div><div className="text-xs text-muted-foreground">{fmt(d.date)}</div><div className="font-semibold">{d.activity}</div></div>
          </li>
        ))}
      </ol>
      <h2 className="mt-6 mb-2 text-lg font-bold">Cost split</h2>
      <div className="rounded-2xl border-2 border-border bg-card p-4">
        {travelers.map((t) => (
          <div key={t.id} className="flex justify-between py-1"><span>{t.first_name}</span><span className="font-bold">${itinerary.perPerson}</span></div>
        ))}
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm text-muted-foreground"><span>Estimated total</span><span>${itinerary.total}</span></div>
        {itinerary.needsCar && <p className="mt-2 text-sm text-muted-foreground">🚗 {itinerary.driver ? `${itinerary.driver} drives — gas split evenly.` : "Car needed — consider a rental, split evenly."}</p>}
      </div>
      {matched && <><GroupPersonality members={travelers} />
      <section className="mt-6 space-y-3"><h2 className="text-lg font-bold">Traveler profiles</h2>{travelers.map((traveler) => <article key={traveler.id} className="rounded-xl border border-border bg-card p-4"><h3 className="font-semibold">{traveler.first_name} · {traveler.details?.year ?? traveler.msba_year}</h3>{traveler.details?.bio && <p className="mt-2 text-sm">{traveler.details.bio}</p>}<p className="mt-2 text-xs text-muted-foreground">{[traveler.details?.pace, traveler.details?.rhythm, traveler.details?.stay].filter(Boolean).join(" · ")}</p>{traveler.details?.private_notes && <div className="mt-3 rounded-lg bg-secondary p-3 text-sm"><p className="font-semibold">Note shared with this confirmed trip</p><p className="mt-1 whitespace-pre-wrap">{traveler.details.private_notes}</p></div>}</article>)}</section>
      <TravelerChat proposalId={id} sample={!!data.isDemo || travelers.some((traveler) => traveler.is_seed)} /></>}
      {!matched && <p className="mt-6 rounded-xl bg-muted p-4 text-sm">Traveler chat unlocks only after a mutual match.</p>}
      <Link to="/" className="mt-8 text-center text-sm font-semibold text-primary underline">Find another trip</Link>
    </Screen>
  );
}
