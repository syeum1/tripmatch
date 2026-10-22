import { upcomingWeekends } from "@/lib/weekends";
import { ProfileEditor } from "@/components/trip/ProfileEditor";
import { PlanGallery } from "@/components/trip/PlanGallery";
import { MyPlans } from "@/components/trip/MyPlans";
import { BudgetFields } from "@/components/trip/BudgetFields";
import { DestinationPicker } from "@/components/trip/DestinationPicker";
import { QuestionScreen } from "@/components/trip/QuestionScreen";
import { DEFAULT_DETAILS, detailsSchema, moneyValue, TRIP_ITEMS, type TravelerDetails } from "@/lib/traveler";
import { discoveryProfile, sampleProfiles } from "@/lib/public-plans";
import { mergeRules, rankMatches, buildItinerary } from "@/lib/matching";
import { clearLocalTraveler, saveDemoTrip } from "@/lib/local-demo";
import { GroupPersonality } from "@/components/trip/Personality";
import { isMbti, type Mbti } from "@/lib/personality";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Chip, GhostButton, Option, PrimaryButton, Screen } from "@/components/trip/ui";
import { SignInScreen } from "@/components/trip/SignInScreen";
import { isUscEmail, isTravelerName, uscSsoEnabled } from "@/lib/sign-in";
import { supabase } from "@/integrations/supabase/client";
import type { Match } from "@/lib/matching";
import { decide, getMatches, proposeMerge, saveProfile, clearProfileSession } from "@/lib/trip.functions";
import {
  BREAKS, BUDGETS, DESTINATIONS, VIBES, findDestination,
  type BreakId, type Budget, type Gear, type MergedPlan, type TripProfile, type Vibe,
} from "@/lib/trip-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TripMatch — Find MSBA classmates to travel with" },
      { name: "description", content: "Answer 5 quick questions and get matched with USC Marshall MSBA classmates for your next break trip." },
      { property: "og:title", content: "TripMatch — Find MSBA classmates to travel with" },
      { property: "og:description", content: "Answer 5 quick questions and get matched with USC Marshall MSBA classmates for your next break trip." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: App,
});

type Step = "signin" | "entry" | "profile" | "browse" | "saved" | 1 | 2 | 3 | 4 | 5 | "matches" | "merge";
type Proposal = { proposalId: string; merged: MergedPlan; source: string; me: TripProfile; them: TripProfile };

const fmt = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const range = (a: string, b: string) => (a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`);

function App() {
  const navigate = useNavigate();
  const save = useServerFn(saveProfile);
  const fetchMatches = useServerFn(getMatches);
  const propose = useServerFn(proposeMerge);
  const decideFn = useServerFn(decide);

  const [step, setStep] = useState<Step>("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [mbti, setMbti] = useState<Mbti | null>(null);
  const [details, setDetails] = useState<TravelerDetails>({ ...DEFAULT_DETAILS });
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [savedProfile, setSavedProfile] = useState<(TripProfile & { localOnly?: boolean }) | null>(null);
  const [pendingJoin, setPendingJoin] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const clearSession = useServerFn(clearProfileSession);
  const [mbtiNotice, setMbtiNotice] = useState(false);
  const [mode, setMode] = useState<"go" | "plan">("go");
  const [weekends] = useState(() => upcomingWeekends());
  const [weekendStart, setWeekendStart] = useState(() => upcomingWeekends()[0]!.start);
  const weekendEnd = weekends.find((weekend) => weekend.start === weekendStart)!.end;
  const [breakId, setBreakId] = useState<BreakId | null>(null);
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [dests, setDests] = useState<string[]>([]);
  const [custom, setCustom] = useState({ destination: "", start: "", end: "" });
  const [budget, setBudget] = useState<Budget | null>(null);
  const [gear, setGear] = useState<Gear[] | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [restoring, setRestoring] = useState(uscSsoEnabled);
  useEffect(() => {
    try {
      const savedDetails = JSON.parse(localStorage.getItem("tm_details") ?? "null");
      if (savedDetails) setDetails(detailsSchema.parse(savedDetails));
      const saved = JSON.parse(localStorage.getItem("tm_saved_profile") ?? "null");
      if (saved?.id && saved.email === localStorage.getItem("tm_email")) { setSavedProfile(saved); setProfileId(saved.id); }
    } catch { /* Ignore incomplete drafts from an earlier app version. */ }
    const savedName = localStorage.getItem("tm_name") ?? "";
    if (isTravelerName(savedName)) setName(savedName);
    const savedMbti = localStorage.getItem("tm_mbti");
    if (isMbti(savedMbti)) setMbti(savedMbti);
    // A stored email alone never counts as an authenticated SSO session.
    let active = true;
    let version = 0;
    async function restore() {
      const current = ++version;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session && !uscSsoEnabled) {
          if (active && current === version) {
            const e = localStorage.getItem("tm_email");
            if (e && isUscEmail(e)) { setEmail(e); setStep(isTravelerName(savedName) ? "entry" : "signin"); }
          }
          return;
        }
        const { data, error } = await supabase.auth.getUser();
        if (!active || current !== version) return;
        const user = data.user;
        if (!error && user?.email && user.email_confirmed_at && isUscEmail(user.email)) {
          setEmail(user.email); setStep(isTravelerName(savedName) ? "entry" : "signin");
        } else { setEmail(""); setStep("signin"); }
      } catch {
        if (active && current === version && uscSsoEnabled) setErr("Could not restore your sign-in. Please try again.");
      } finally { if (active && current === version) setRestoring(false); }
    }
    void restore();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Defer auth calls until the auth event handler has released its lock.
      window.setTimeout(() => { if (active) void restore(); }, 0);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function startSso() {
    localStorage.setItem("tm_name", name.trim());
    const { data, error } = await supabase.auth.signInWithSSO({
      domain: "usc.edu",
      options: { redirectTo: window.location.origin + "/" },
    });
    if (error || !data?.url) throw new Error("USC SSO is not configured");
    const target = new URL(data.url);
    if (target.protocol !== "https:") throw new Error("Invalid SSO redirect");
    window.location.assign(target.href);
  }

  async function signOut() {
    await run(async () => {
      if (uscSsoEnabled || (await supabase.auth.getSession()).data.session) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
      await clearSession();
      clearLocalTraveler(); setDetails({ ...DEFAULT_DETAILS }); setSavedProfile(null); setMbti(null);
      setEmail(""); setName(""); setProfileId(null); setMatches([]); setProposal(null); setStep("signin");
    });
  }

  const total = 5;
  const firstName = name.trim() || "Trojan";

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true); setErr(null);
    try { return await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
    return undefined;
  }

  async function finishOnboarding(g: Gear[]) {
    const low = moneyValue(budgetMin), high = moneyValue(budgetMax);
    if (low === null || high === null || high < low) { setErr("Enter a valid budget range."); return; }
    setGear(g);
    await run(async () => {
      const b = breakId!;
      const top = findDestination(b, dests[0] ?? "");
      const start = mode === "plan" ? custom.start : b === "weekend" ? weekendStart : top?.start ?? BREAKS.find((item) => item.id === b)!.start;
      const end = mode === "plan" ? custom.end || custom.start : b === "weekend" ? weekendEnd : top?.end ?? BREAKS.find((item) => item.id === b)!.end;
      const updatedDetails = { ...details, trip_tags: details.trip_tags.filter((item) => item !== "Car" && item !== "Tent" || item === "Car" && g.includes("car") || item === "Tent" && g.includes("tent")), budget_min: low, budget_max: high };
      const input = { email, mbti, details: updatedDetails, first_name: firstName, msba_year: details.year, break_id: b, vibes, destinations: dests, start_date: start, end_date: end, budget: budget!, gear: g };
      const p = await save({ data: input });
      const own = { ...input, ...p, details: updatedDetails } as TripProfile & { localOnly: boolean };
      localStorage.setItem("tm_saved_profile", JSON.stringify(own));
      localStorage.setItem("tm_details", JSON.stringify(updatedDetails));
      setSavedProfile(own); setProfileId(p.id); setMbtiNotice(!p.detailsPersisted);
      setMatches([]); setStep("matches");
      if (own.localOnly) {
        setMatches(rankMatches(own, sampleProfiles).map((match) => ({ ...match, profile: discoveryProfile(match.profile) })));
      } else {
        setMatching(true);
        void fetchMatches({ data: { profileId: p.id, mbti } }).then((result) => setMatches(result.matches)).catch(() => setErr("Your plan was saved, but matches could not load. You can browse all trips or retry.")).finally(() => setMatching(false));
      }
      if (pendingJoin) { const target = pendingJoin; setPendingJoin(null); await openMatch(target, undefined, own); }
    });
  }

  async function openMatch(id: string, override?: { destination?: string; start_date?: string; end_date?: string }, own = savedProfile) {
    if (!own) { setPendingJoin(id); setStep("profile"); return; }
    await run(async () => {
      if (own.localOnly) {
        const target = sampleProfiles.find((profile) => profile.id === id);
        if (!target) throw new Error("That local sample plan is no longer available.");
        setProposal({ proposalId: crypto.randomUUID(), merged: mergeRules(own, target, override), source: "demo", me: own, them: discoveryProfile(target) });
      } else {
        const result = await propose({ data: { profileId: own.id, matchId: id, override } });
        setProposal({ ...result, me: { ...result.me, mbti, details: own.details } } as Proposal);
      }
      setStep("merge");
    });
  }

  // ---------- Screens ----------
  if (step === "signin") {
    return <SignInScreen name={name} onNameChange={setName} email={email} onEmailChange={setEmail} ssoEnabled={uscSsoEnabled}
      onSso={startSso} restoring={restoring} error={err}
      onContinue={() => {
        const e = email.trim().toLowerCase();
        setEmail(e); setName(name.trim()); localStorage.setItem("tm_email", e); localStorage.setItem("tm_name", name.trim()); setStep("entry");
      }} />;
  }

  if (step === "profile") return <Screen><button className="mb-5 self-start text-sm text-primary underline" onClick={() => setStep("entry")}>← Home</button><ProfileEditor details={details} onChange={setDetails} mbti={mbti} onMbti={setMbti} onDone={() => {
    localStorage.setItem("tm_details", JSON.stringify(details));
    if (mbti) localStorage.setItem("tm_mbti", mbti); else localStorage.removeItem("tm_mbti");
    setStep(pendingJoin ? 1 : "entry");
  }} /></Screen>;
  if (step === "browse") return <Screen><button className="mb-4 self-start text-sm text-primary underline" onClick={() => setStep("entry")}>← Home</button><PlanGallery viewer={savedProfile ?? undefined} onJoin={(id) => void openMatch(id)} />{busy && <p role="status">Opening plan…</p>}{err && <p role="alert" className="mt-3 text-sm text-destructive">{err}</p>}</Screen>;
  if (step === "saved") return <Screen><button className="mb-4 self-start text-sm text-primary underline" onClick={() => setStep("entry")}>← Home</button><MyPlans profile={savedProfile} /></Screen>;
  if (step === "entry") return <Screen>
    <h1 className="text-3xl font-extrabold">Hi {firstName}</h1><p className="mt-2 text-muted-foreground">Where are you starting from?</p>
    <div className="mt-5 flex flex-wrap gap-3"><button onClick={() => setStep("profile")} className="rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold">Profile · {details.year}{mbti ? ` · ${mbti}` : ""}</button><button onClick={() => setStep("saved")} className="rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold">My plans & invitations</button></div>
    <div className="mt-6 space-y-3"><Option onClick={() => { setMode("go"); setStep(1); }}><div className="text-lg font-bold">I want to go somewhere</div><div className="text-sm text-muted-foreground">Pick from popular trips for your break</div></Option><Option onClick={() => { setMode("plan"); setStep(1); }}><div className="text-lg font-bold">I already have a plan</div><div className="text-sm text-muted-foreground">Type destinations and check them on Google Maps</div></Option><Option onClick={() => setStep("browse")}><div className="text-lg font-bold">Explore all trips</div><div className="text-sm text-muted-foreground">Browse classmates’ plans, with or without a saved plan</div></Option></div>
    <button className="mt-auto pt-8 text-sm text-muted-foreground underline" disabled={busy} onClick={signOut}>Not {email}? Sign out</button>{err && <p role="alert" className="mt-3 text-sm text-destructive">{err}</p>}
  </Screen>;

  if (typeof step === "number") {
    const back = () => setStep(step === 1 ? "entry" : ((step - 1) as Step));
    if (step === 1)
      return (
        <QuestionScreen step={step} total={total} busy={busy} error={err} onBack={back} context={JSON.stringify({ destinations: dests, budget, vibes, mbti })} title="Which break?" next={breakId === "weekend" ? () => setStep(2) : undefined} canNext={!!weekendStart}>
          {BREAKS.map((b) => (
            <Option key={b.id} selected={breakId === b.id} onClick={() => { if (b.id !== breakId) setDests([]); setBreakId(b.id); if (b.id !== "weekend") setStep(2); }}>
              <div className="font-bold">{b.id === "weekend" ? "A weekend" : b.label}</div>
              <div className="text-sm text-muted-foreground">{b.id === "weekend" ? `This weekend ${range(weekends[0]!.start, weekends[0]!.end)} · more dates` : range(b.start, b.end)}</div>
            </Option>
          ))}
          {breakId === "weekend" && <label className="mt-4 block text-sm font-semibold">Choose a weekend<select value={weekendStart} onChange={(event) => setWeekendStart(event.target.value)} className="mt-2 h-14 w-full rounded-xl border border-border bg-card px-3">{weekends.map((weekend, index) => <option key={weekend.start} value={weekend.start}>{index === 0 ? "This weekend · " : ""}{range(weekend.start, weekend.end)}</option>)}</select><span className="mt-2 block font-normal text-muted-foreground">One weekend per plan. For other dates, use “I already have a plan.”</span></label>}
        </QuestionScreen>
      );

    if (step === 2)
      return (
        <QuestionScreen step={step} total={total} busy={busy} error={err} onBack={back} context={JSON.stringify({ destinations: dests, budget, vibes, mbti })} title="What's your vibe? (up to 2)" next={() => setStep(3)} canNext={vibes.length > 0}>
          <div className="grid grid-cols-2 gap-3">
            {VIBES.map((v) => {
              const on = vibes.includes(v);
              return (
                <Option key={v} selected={on} onClick={() => setVibes(on ? vibes.filter((x) => x !== v) : vibes.length < 2 ? [...vibes, v] : [vibes[1]!, v])}>
                  <div className="py-2 text-center"><div className="font-bold">{v}</div><p className="mt-1 text-xs text-muted-foreground">{{ Adventure: "Hikes and outdoor activities", Artsy: "Museums, design and local culture", Touristy: "Landmarks and classic sights", Relaxed: "Slow days with room to unwind" }[v]}</p></div>
                </Option>
              );
            })}
          </div>
        </QuestionScreen>
      );

    if (step === 3 && mode === "go") {
      const list = DESTINATIONS[breakId!];
      return (
        <QuestionScreen step={step} total={total} busy={busy} error={err} onBack={back} context={JSON.stringify({ destinations: dests, budget, vibes, mbti })} title="Pick & rank up to 3" next={() => setStep(4)} canNext={dests.length > 0}>
          <p className="-mt-3 text-sm text-muted-foreground">Tap in order of preference.</p>
          {list.map((dst) => {
            const rank = dests.indexOf(dst.name);
            return (
              <Option
                key={dst.name}
                selected={rank >= 0}
                onClick={() => setDests(rank >= 0 ? dests.filter((x) => x !== dst.name) : dests.length < 3 ? [...dests, dst.name] : dests)}
                badge={<span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${rank >= 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{rank >= 0 ? rank + 1 : ""}</span>}
              >
                <div className="font-bold">{dst.name}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">
                  ${dst.min}–{dst.max.toLocaleString()} pp · {dst.car ? "🚗 Car needed" : "No car needed"} · {breakId === "weekend" ? range(weekendStart, weekendEnd) : range(dst.start, dst.end)}
                </div>
              </Option>
            );
          })}
        </QuestionScreen>
      );
    }

    if (step === 3) return <QuestionScreen step={step} total={total} busy={busy} error={err} onBack={back} context="Custom trip" title="Your plan" next={() => setStep(4)} canNext={dests.length > 0 && !!custom.start && (!custom.end || custom.end >= custom.start)}>
      <DestinationPicker values={dests} onChange={setDests} />
      <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Start<input type="date" value={custom.start} onInput={(event) => { const value = event.currentTarget.value; setCustom((draft) => ({ ...draft, start: value })); }} onChange={(event) => setCustom((draft) => ({ ...draft, start: event.target.value }))} className="mt-1 h-14 w-full rounded-xl border-2 border-border bg-card px-2" /></label><label className="text-sm font-semibold">End<input type="date" value={custom.end} min={custom.start} onInput={(event) => { const value = event.currentTarget.value; setCustom((draft) => ({ ...draft, end: value })); }} onChange={(event) => setCustom((draft) => ({ ...draft, end: event.target.value }))} className="mt-1 h-14 w-full rounded-xl border-2 border-border bg-card px-2" /></label></div>
    </QuestionScreen>;
    if (step === 4) return <QuestionScreen step={step} total={total} busy={busy} error={err} onBack={back} context="Trip budget" title="Budget per person" next={() => { const max = moneyValue(budgetMax)!; setBudget(max <= 300 ? "under300" : max <= 700 ? "300-700" : "700plus"); setStep(5); }} canNext={moneyValue(budgetMin) !== null && moneyValue(budgetMax) !== null && Number(budgetMax) >= Number(budgetMin)}>
      <BudgetFields min={budgetMin} max={budgetMax} onMin={setBudgetMin} onMax={setBudgetMax} />
    </QuestionScreen>;
    const outdoors = dests.some((place) => /joshua|yosemite|zion|bryce|mammoth|big bear|grand canyon|sedona/i.test(place));
    const international = dests.some((place) => /tokyo|cabo|cancun|cancún/i.test(place));
    const items = TRIP_ITEMS.filter((item) => item === "Tent" ? outdoors : item === "Car" ? !international : true);
    return <QuestionScreen step={step} total={total} busy={busy} error={err} onBack={back} context={JSON.stringify({ destinations: dests })} title="What can you bring?">
      <p className="text-sm text-muted-foreground">Optional. Pick items you can share on this trip.</p>
      <div className="flex flex-wrap gap-2">{items.map((item) => { const selected = details.trip_tags.includes(item); return <button type="button" aria-pressed={selected} key={item} disabled={busy} onClick={() => setDetails({ ...details, trip_tags: selected ? details.trip_tags.filter((value) => value !== item) : [...details.trip_tags, item] })} className={`rounded-full border-2 px-4 py-2 text-sm ${selected ? "border-primary bg-secondary" : "border-border bg-card"}`}>{item}</button>; })}</div>
      <label className="mt-5 block text-sm font-semibold">Private notes <span className="font-normal text-muted-foreground">(optional)</span><textarea maxLength={1000} rows={3} className="mt-2 w-full rounded-xl border-2 border-border bg-card p-3 font-normal" value={details.private_notes} onChange={(event) => setDetails({ ...details, private_notes: event.target.value })} placeholder="Anything your confirmed trip members should know…" /></label>
      <p className="text-xs text-muted-foreground">Only you can see these until both travelers accept the plan. Then only members of that confirmed trip can see them.</p>
      <PrimaryButton disabled={busy} className="mt-6" onClick={() => { const tags = details.trip_tags.filter((item) => items.includes(item)); const g: Gear[] = [...(tags.includes("Car") ? ["car" as const] : []), ...(tags.includes("Tent") ? ["tent" as const] : [])]; void finishOnboarding(g); }}>{busy ? "Saving plan…" : "Save plan and find matches"}</PrimaryButton>
    </QuestionScreen>;
  }

  if (step === "matches") {
    return (
      <Screen step={BREAKS.find((b) => b.id === breakId)?.label ?? ""} assistantContext={JSON.stringify({ destinations: dests, budget, vibes, mbti })}>
        <h1 className="text-3xl font-extrabold">Your matches</h1>
        <p className="mt-1 text-muted-foreground">Ranked by how well your plans fit. Get to know your potential travel crew.</p>
        {savedProfile?.localOnly && <p role="status" className="mt-3 rounded-xl bg-secondary p-3 text-sm">Saved on this device only. Shared storage isn’t connected; the matches below are sample trips.</p>}
        <button onClick={() => setStep("browse")} className="mt-4 text-sm font-semibold text-primary underline">Explore all trips, regardless of score</button>
        {matching && <p role="status" className="mt-4">Your plan is saved. Loading matches…</p>}
        {mbtiNotice && <p role="status" className="mt-3 text-xs text-muted-foreground">Your extended profile is saved on this device. The team’s storage update is needed to share it with confirmed trip members.</p>}
        <p className="mt-2 text-xs text-muted-foreground">MBTI compares shared preferences, not proven travel compatibility.</p>
        <div className="mt-6 space-y-3">
          {!matching && matches.length === 0 && <p className="rounded-2xl bg-muted p-6 text-center text-muted-foreground">No close matches yet — try a different break or destination.</p>}
          {matches.map((m) => (
            <article key={m.profile.id} className="trip-plan-card w-full p-4 text-left">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary font-display text-lg font-bold text-primary">{m.profile.first_name[0]}</div>
                <div className="flex-1">
                  <div className="text-lg font-bold">{m.profile.first_name}</div>
                  {m.profile.is_seed && <span className="text-xs text-muted-foreground">Sample profile</span>}
                  <div className="text-sm text-muted-foreground">{m.profile.msba_year} · {m.profile.destinations[0]}</div>
                </div>
                <div className="text-right"><div className="font-display text-2xl font-extrabold text-primary">{m.score}%</div><div className="text-xs text-muted-foreground">match</div></div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{m.mbtiPercent === null ? "MBTI not provided by both travelers" : `MBTI preference match: ${m.mbtiPercent}% shared preferences`}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {m.reasons.map((r, i) => <Chip key={r} tone={i === 0 ? "gold" : "muted"}>{r}</Chip>)}
              </div>
              <PrimaryButton className="mt-4" disabled={busy} onClick={() => openMatch(m.profile.id)}>View shared plan</PrimaryButton>
            </article>
          ))}
        </div>
        {busy && <p className="mt-4 text-center text-sm font-semibold text-primary">Merging your plans…</p>}
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
        <button className="mt-6 self-start text-sm text-primary underline" onClick={() => setStep("entry")}>← Home</button>
        <GhostButton className="mt-6" onClick={() => setStep(1)}>Change my answers</GhostButton>
      </Screen>
    );
  }

  if (step === "merge" && proposal) {
    return (
      <MergeScreen
        proposal={proposal}
        busy={busy}
        err={err}
        onBack={() => setStep("matches")}
        onAccept={() => run(async () => {
          if (proposal.source === "demo") saveDemoTrip(proposal.proposalId, { status: "accepted", viewerId: proposal.me.id, acceptedBy: [proposal.me.id, proposal.them.id], merged: proposal.merged, travelers: [proposal.me, proposal.them], itinerary: buildItinerary(proposal.me.break_id, proposal.merged, [proposal.me, proposal.them]), isDemo: true });
          else await decideFn({ data: { proposalId: proposal.proposalId, status: "accepted" } });
          navigate({ to: "/trip/$id", params: { id: proposal.proposalId } });
        })}
        onPass={() => run(async () => { if (proposal.source !== "demo") await decideFn({ data: { proposalId: proposal.proposalId, status: "passed" } }); setMatches(matches.filter((m) => m.profile.id !== proposal.them.id)); setStep("matches"); })}
        onCounter={(o) => openMatch(proposal.them.id, o)}
      />
    );
  }
  return null;
}

function MergeScreen({ proposal, busy, err, onBack, onAccept, onPass, onCounter }: {
  proposal: Proposal; busy: boolean; err: string | null; onBack: () => void; onAccept: () => void; onPass: () => void;
  onCounter: (o: { destination: string; start_date: string; end_date: string }) => void;
}) {
  const { me, them, merged } = proposal;
  const [countering, setCountering] = useState(false);
  const [c, setC] = useState({ destination: merged.destination, start_date: merged.start_date, end_date: merged.end_date });
  useEffect(() => { setCountering(false); setC({ destination: merged.destination, start_date: merged.start_date, end_date: merged.end_date }); }, [merged]);

  const PlanCard = ({ who, p }: { who: string; p: TripProfile }) => (
    <div className="rounded-2xl border-2 border-border bg-card p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{who}</div>
      <div className="mt-1 font-bold leading-tight">{p.destinations[0]}</div>
      <div className="text-sm text-muted-foreground">{range(p.start_date, p.end_date)}</div>
    </div>
  );

  return (
    <Screen step={`with ${them.first_name}`} assistantContext={JSON.stringify({ destination: merged.destination, start: merged.start_date, end: merged.end_date, budget: me.budget, mbti: me.mbti })}>
      <button onClick={onBack} className="mb-3 self-start text-sm font-semibold text-muted-foreground">← Matches</button>
      <h1 className="text-2xl font-extrabold">Your merged plan</h1>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <PlanCard who="You" p={me} />
        <PlanCard who={them.first_name} p={them} />
      </div>
      <div className="mt-4 rounded-2xl bg-primary p-5 text-primary-foreground shadow-card">
        <div className="text-xs font-semibold uppercase tracking-widest opacity-80">Proposed {proposal.source === "ai" ? "· AI" : ""}</div>
        <div className="mt-1 font-display text-2xl font-extrabold">{merged.destination}</div>
        <div className="opacity-90">{range(merged.start_date, merged.end_date)}</div>
        <p className="mt-2 text-sm opacity-90">{merged.summary}</p>
      </div>
      <div className="mt-4 space-y-2">
        {merged.changes.length === 0 && <p className="text-sm text-muted-foreground">No changes needed — your plans already line up.</p>}
        {merged.changes.map((ch, i) => (
          <div key={i} className="rounded-2xl bg-secondary p-3">
            <div className="text-sm font-bold">{ch.field}: <span className="font-normal text-muted-foreground line-through">{ch.from}</span> → {ch.to}</div>
            <div className="text-sm text-muted-foreground">{ch.reason}</div>
          </div>
        ))}
      </div>

      {proposal.source === "demo" && <p className="mt-3 text-xs text-muted-foreground">Local demonstration with a sample traveler. No real invitation or booking will be sent.</p>}
      <p className="mt-4 text-sm text-muted-foreground">Traveler chat unlocks after this plan is confirmed.</p>
      {countering ? (
        <div className="mt-6 space-y-3 rounded-2xl border-2 border-accent bg-card p-4">
          <div className="font-bold">Counter-propose</div>
          <input value={c.destination} onChange={(e) => setC({ ...c, destination: e.target.value })} list="counter-dests" className="h-12 w-full rounded-xl border-2 border-border px-3" />
          <datalist id="counter-dests">{DESTINATIONS[me.break_id].map((x) => <option key={x.name} value={x.name} />)}</datalist>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={c.start_date} onChange={(e) => setC({ ...c, start_date: e.target.value })} className="h-12 rounded-xl border-2 border-border px-2" />
            <input type="date" value={c.end_date} onChange={(e) => setC({ ...c, end_date: e.target.value })} className="h-12 rounded-xl border-2 border-border px-2" />
          </div>
          <PrimaryButton disabled={busy || !c.destination.trim() || c.end_date < c.start_date} onClick={() => onCounter(c)}>{busy ? "Re-proposing…" : "Re-propose"}</PrimaryButton>
          <button className="w-full text-sm font-semibold text-muted-foreground" onClick={() => setCountering(false)}>Cancel</button>
        </div>
      ) : (
        <div className="mt-auto space-y-3 pt-8">
          <PrimaryButton disabled={busy} onClick={onAccept}>{busy ? "Saving…" : "Accept plan"}</PrimaryButton>
          <div className="grid grid-cols-2 gap-3">
            <GhostButton disabled={busy} onClick={() => setCountering(true)}>Counter</GhostButton>
            <GhostButton disabled={busy} onClick={onPass}>Pass</GhostButton>
          </div>
        </div>
      )}
      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
    </Screen>
  );
}
