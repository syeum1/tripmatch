import { z } from "zod";
import type { MergedPlan, Plan } from "./trip-data";

const mergedSchema = z.object({
  destination: z.string().min(1).max(80), start_date: z.string().date(), end_date: z.string().date(),
  summary: z.string().min(1).max(800),
  changes: z.array(z.object({ field: z.string().max(60), from: z.string().max(200), to: z.string().max(200), reason: z.string().max(300) })).max(10),
});

// AI can explain the compromise, but cannot silently move dates or destinations.
export function validateAiMerge(value: unknown, draft: MergedPlan, locked?: Partial<Plan>): MergedPlan | null {
  const parsed = mergedSchema.safeParse(value);
  if (!parsed.success) return null;
  const result = parsed.data;
  if (result.end_date < result.start_date) return null;
  for (const field of ["destination", "start_date", "end_date"] as const) {
    if (result[field] !== (locked?.[field] ?? draft[field])) return null;
  }
  return result;
}
