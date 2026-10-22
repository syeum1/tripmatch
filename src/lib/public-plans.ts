import type { TripProfile } from "./trip-data";
import { BREAKS, DESTINATIONS } from "./trip-data";
import { scoreMatch } from "./matching";
export type PublicPlan = { id: string; firstName: string; year: string; destinations: string[]; start: string; end: string; breakId: TripProfile["break_id"]; budgetMin: number; budgetMax: number; vibes: string[]; items: string[]; pace: string | null; score: number | null; sample: boolean };
const budgetRanges = { under300: [0, 300], "300-700": [300, 700], "700plus": [700, 2500] } as const;
export function publicPlan(profile: TripProfile, viewer?: TripProfile): PublicPlan {
  const range = budgetRanges[profile.budget];
  return { id: profile.id, firstName: profile.first_name, year: profile.details?.year ?? profile.msba_year, destinations: profile.destinations, start: profile.start_date, end: profile.end_date, breakId: profile.break_id,
    budgetMin: profile.details?.budget_min ?? range[0], budgetMax: profile.details?.budget_max ?? range[1],
    vibes: profile.vibes, items: profile.details?.trip_tags ?? profile.gear, pace: profile.details?.pace ?? null,
    score: viewer ? scoreMatch(viewer, profile)?.score ?? 0 : null, sample: !!profile.is_seed };
}
export function discoveryProfile(profile: TripProfile): TripProfile {
  return { id: profile.id, first_name: profile.first_name, email: "", msba_year: profile.details?.year ?? profile.msba_year, break_id: profile.break_id, vibes: profile.vibes, destinations: profile.destinations, start_date: profile.start_date, end_date: profile.end_date, budget: profile.budget, gear: profile.gear, is_seed: !!profile.is_seed };
}
// Explicit sample trips keep a disconnected local preview usable, without pretending
// to load classmates. No private profiles or fabricated MBTI types are included.
const sampleNames: Record<TripProfile["break_id"], string[]> = { thanksgiving: ["Aisha", "Ben", "Chloe", "Diego", "Emma"], winter: ["Noah", "Olivia", "Priya", "Quinn", "Rohan"], spring: ["Tyler", "Uma", "Victor", "Wen", "Ximena"], weekend: ["Zoe", "Arjun", "Bella", "Carlos", "Dana"] };
export const sampleProfiles: TripProfile[] = BREAKS.flatMap((brk) => DESTINATIONS[brk.id].map((destination, i) => ({
  id: `00000000-0000-4000-8000-${String(["thanksgiving", "winter", "spring", "weekend"].indexOf(brk.id) * 10 + i + 1).padStart(12, "0")}`, email: "", first_name: sampleNames[brk.id][i] ?? "Sample traveler", msba_year: "MSBA", break_id: brk.id,
  vibes: ["Relaxed", "Touristy"], destinations: [destination.name], start_date: destination.start, end_date: destination.end,
  budget: destination.max <= 300 ? "under300" : destination.max <= 700 ? "300-700" : "700plus", gear: destination.car ? ["car"] : [], is_seed: true,
})));
