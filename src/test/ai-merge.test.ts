import { describe, expect, it } from "vitest";
import { validateAiMerge } from "@/lib/ai-merge";

const draft = { destination: "San Diego", start_date: "2026-11-07", end_date: "2026-11-08", summary: "A shared weekend", changes: [] };
describe("restored AI merge", () => {
  it("allows explanations without changing the agreed draft", () => {
    expect(validateAiMerge({ ...draft, summary: "Both travelers get a relaxed weekend." }, draft)?.summary).toContain("Both travelers");
  });
  it("rejects changed dates, invented destinations, broken output, and ignored counterproposals", () => {
    expect(validateAiMerge({ ...draft, start_date: "2026-11-09" }, draft)).toBeNull();
    expect(validateAiMerge({ ...draft, destination: "Tokyo" }, draft)).toBeNull();
    expect(validateAiMerge({ summary: "Incomplete" }, draft)).toBeNull();
    expect(validateAiMerge(draft, draft, { destination: "Malibu" })).toBeNull();
  });
});
