import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { detailsSchema } from "./traveler";
import { publicPlan, discoveryProfile, sampleProfiles } from "./public-plans";
import { isMbti } from "./personality";
import { buildItinerary, mergeRules, planOf, rankMatches } from "./matching";
import type { MergedPlan, Plan, TripProfile } from "./trip-data";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const toProfile = (r: Record<string, unknown>) => r as unknown as TripProfile;

const backendReady = () => !!process.env['SUPABASE_SERVICE_ROLE_KEY'];
const profileInput = z.object({ email: z.string().trim().toLowerCase().email().regex(/@usc\.edu$/i), first_name: z.string().min(1).max(60), msba_year: z.string().max(30), break_id: z.enum(["thanksgiving", "winter", "spring", "weekend"]), vibes: z.array(z.enum(["Adventure", "Artsy", "Touristy", "Relaxed"])).min(1).max(4), destinations: z.array(z.string().trim().min(1).max(80)).min(1).max(5), start_date: z.string().date(), end_date: z.string().date(), budget: z.enum(["under300", "300-700", "700plus"]), gear: z.array(z.enum(["car", "tent"])).max(2), mbti: z.string().nullable().optional(), details: detailsSchema.optional() }).refine((data) => data.end_date >= data.start_date, "End date must follow start date.");

export const saveProfile = createServerFn({ method: "POST" })
  .inputValidator((data: Omit<TripProfile, "id">) => {
    const parsed = profileInput.parse(data);
    if (parsed.mbti != null && !isMbti(parsed.mbti)) throw new Error("Choose a valid MBTI type.");
    return parsed;
  })
  .handler(async ({ data }) => {
    if (!backendReady()) return { ...data, id: crypto.randomUUID(), mbti: data.mbti as import("./personality").Mbti | null, mbtiPersisted: false, detailsPersisted: false, localOnly: true };
    const { currentActor } = await import("./trip-access.server");
    const actor = await currentActor();
    if (actor.email && data.email !== actor.email) throw new Error("Use the email from your verified sign-in.");
    const db = await admin();
    const { data: existing, error: lookupError } = await db.from("trip_profiles").select("id").eq("email", data.email).abortSignal(AbortSignal.timeout(8000)).maybeSingle();
    if (lookupError) throw new Error("Profile storage did not respond. Your answers are still here; please retry.");
    if (existing && actor.profileId !== existing.id && actor.email !== data.email) throw new Error("This email already has a saved profile. Use verified sign-in to edit it.");
    const { mbti, details, ...fields } = data;
    const values = { ...fields, is_seed: false };
    let result = await db.from("trip_profiles").upsert({ ...values, mbti: mbti ?? null, details: details as never }, { onConflict: "email" }).select().abortSignal(AbortSignal.timeout(8000)).single();
    let extended = true;
    if (result.error && ["PGRST204", "42703"].includes(result.error.code) && /mbti|details/i.test(result.error.message)) {
      result = await db.from("trip_profiles").upsert(values, { onConflict: "email" }).select().abortSignal(AbortSignal.timeout(8000)).single();
      extended = false;
    }
    if (result.error) throw new Error("We could not save to shared storage. Your answers are still here; please retry.");
    const { issueDeviceProfile } = await import("./device-session.server");
    await issueDeviceProfile(result.data.id);
    return { ...toProfile(result.data), mbti: mbti as import("./personality").Mbti | null, details, mbtiPersisted: extended, detailsPersisted: extended, localOnly: false };
  });

export const browsePlans = createServerFn({ method: "POST" }).inputValidator((data: { viewer?: TripProfile }) => data).handler(async ({ data }) => {
  if (!backendReady()) return { plans: sampleProfiles.map((profile) => publicPlan(profile, data.viewer)), localOnly: true };
  const db = await admin();
  const { data: rows, error } = await db.from("trip_profiles").select().limit(100).abortSignal(AbortSignal.timeout(8000));
  if (error) throw new Error("Trips could not load. Please try again.");
  return { plans: (rows ?? []).filter((row) => row.id !== data.viewer?.id).map((row) => publicPlan(toProfile(row), data.viewer)), localOnly: false };
});

export const clearProfileSession = createServerFn({ method: "POST" }).handler(async () => {
  const { clearDeviceProfile } = await import("./device-session.server"); clearDeviceProfile(); return { ok: true };
});

export const getMatches = createServerFn({ method: "POST" })
  .inputValidator((d: { profileId: string; mbti?: import("./personality").Mbti | null }) => { if (d.mbti != null && !isMbti(d.mbti)) throw new Error("Invalid MBTI"); return d; })
  .handler(async ({ data }) => {
    const { requireProfileOwner } = await import("./trip-access.server");
    await requireProfileOwner(data.profileId);
    const db = await admin();
    const { data: me } = await db.from("trip_profiles").select().eq("id", data.profileId).single();
    if (!me) throw new Error("Profile not found");
    const { data: pool } = await db.from("trip_profiles").select().eq("break_id", me.break_id).neq("id", me.id);
    const profile = { ...toProfile(me), ...(data.mbti !== undefined ? { mbti: data.mbti } : {}) };
    return { me: profile, matches: rankMatches(profile, (pool ?? []).map(toProfile)).map((match) => ({ ...match, profile: discoveryProfile(match.profile) })) };
  });

export const proposeMerge = createServerFn({ method: "POST" })
  .inputValidator((d: { profileId: string; matchId: string; override?: Partial<Plan> | undefined }) => d)
  .handler(async ({ data }) => {
    const { requireProfileOwner } = await import("./trip-access.server");
    await requireProfileOwner(data.profileId);
    const db = await admin();
    const { data: rows } = await db.from("trip_profiles").select().in("id", [data.profileId, data.matchId]);
    const me = rows?.find((r) => r.id === data.profileId);
    const them = rows?.find((r) => r.id === data.matchId);
    if (!me || !them) throw new Error("Profile not found");
    const rules = mergeRules(discoveryProfile(toProfile(me)), discoveryProfile(toProfile(them)), data.override);
    const { aiMerge } = await import("./ai-merge.server");
    const ai = await aiMerge(discoveryProfile(toProfile(me)), discoveryProfile(toProfile(them)), rules, data.override);
    const merged = ai ?? rules;
    const { data: prop, error } = await db
      .from("proposals")
      .insert({
        user_profile_id: me.id,
        match_profile_id: them.id,
        merged: merged as never,
        source: ai ? "ai" : "rules",
        status: data.override ? "countered" : "proposed",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { proposalId: prop.id, merged, source: prop.source, me: toProfile(me), them: discoveryProfile(toProfile(them)) };
  });

export const decide = createServerFn({ method: "POST" })
  .inputValidator((d: { proposalId: string; status: "accepted" | "passed" }) => d)
  .handler(async ({ data }) => {
    const { requireProposalAccess } = await import("./trip-access.server");
    const actorId = await requireProposalAccess(data.proposalId, false);
    const db = await admin();
    const { data: status, error } = await db.rpc("decide_trip_plan", { p_proposal: data.proposalId, p_actor: actorId!, p_status: data.status });
    if (error) throw new Error("The team needs to update shared plan confirmation. Your plan has not been changed.");
    return { ok: true, status };
  });

export const getItinerary = createServerFn({ method: "POST" })
  .inputValidator((d: { proposalId: string }) => d)
  .handler(async ({ data }) => {
    const { requireProposalAccess } = await import("./trip-access.server");
    const viewerId = await requireProposalAccess(data.proposalId, false);
    const db = await admin();
    const { data: prop } = await db.from("proposals").select().eq("id", data.proposalId).single();
    if (!prop) throw new Error("Trip not found");
    const { data: rows } = await db.from("trip_profiles").select().in("id", [prop.user_profile_id, prop.match_profile_id]);
    const sample = rows?.some((profile) => profile.is_seed) ?? false;
    const mutuallyAccepted = prop.status === "accepted" && (sample || [prop.user_profile_id, prop.match_profile_id].every((id) => prop.accepted_by?.includes(id)));
    const travelers = [prop.user_profile_id, prop.match_profile_id].map((id) => {
      const profile = toProfile(rows!.find((r) => r.id === id)!);
      return profile.id === viewerId || mutuallyAccepted ? profile : discoveryProfile(profile);
    });
    const merged = prop.merged as unknown as MergedPlan;
    return { status: prop.status === "accepted" && !mutuallyAccepted ? "proposed" : prop.status, viewerId, acceptedBy: prop.accepted_by ?? [], merged, travelers, itinerary: buildItinerary(travelers[0]!.break_id, merged, travelers) };
  });

export const listMyPlans = createServerFn({ method: "POST" }).inputValidator((data: { profileId: string }) => data).handler(async ({ data }) => {
  const { requireProfileOwner } = await import("./trip-access.server"); await requireProfileOwner(data.profileId);
  const db = await admin();
  const { data: plans, error } = await db.from("proposals").select("id,status,merged,accepted_by").or(`user_profile_id.eq.${data.profileId},match_profile_id.eq.${data.profileId}`).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error("Saved plans could not load. The team may need to update shared storage.");
  return plans;
});
