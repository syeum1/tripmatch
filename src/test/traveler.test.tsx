import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BudgetFields } from "@/components/trip/BudgetFields";
import { detailsSchema, mapUrl, moneyDraft, moneyValue } from "@/lib/traveler";
import { discoveryProfile, publicPlan, sampleProfiles } from "@/lib/public-plans";
vi.mock("@/components/trip/TripAssistant", () => ({ TripAssistant: () => null }));
afterEach(cleanup);
describe("budget entry", () => {
  it("allows clearing zero, normalizes leading zeros, and preserves focus while typing", () => {
    function Form() { const [min, setMin] = useState("0"), [max, setMax] = useState("500"); return <BudgetFields min={min} max={max} onMin={setMin} onMax={setMax} />; }
    render(<Form />);
    const input = screen.getByLabelText("Minimum budget"); input.focus();
    fireEvent.change(input, { target: { value: "" } }); expect(input).toHaveValue("");
    fireEvent.change(input, { target: { value: "0200" } }); expect(input).toHaveValue("200"); expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "600" } }); expect(screen.getByRole("alert")).toHaveTextContent("Maximum budget");
    expect(moneyDraft("200-")).toBeNull(); expect(moneyValue("")).toBeNull(); expect(moneyValue("0")).toBe(0);
  });
  it("validates profile limits and reversed budgets", () => {
    expect(detailsSchema.safeParse({ bio: "x".repeat(141) }).success).toBe(false);
    expect(detailsSchema.safeParse({ budget_min: 200, budget_max: 100 }).success).toBe(false);
    expect(detailsSchema.safeParse({ year: "2nd year", bio: "" }).success).toBe(true);
  });
});
describe("first-name discovery", () => {
  const privateProfile = { ...sampleProfiles[0]!, email: "private@usc.edu", first_name: "Private Name", mbti: "INTJ" as const, details: detailsSchema.parse({ bio: "Personal bio", private_notes: "Secret note", year: "2nd year" }) };
  it("shows first names while withholding email and private profile fields", () => {
    for (const value of [publicPlan(privateProfile), discoveryProfile(privateProfile)]) {
      const response = JSON.stringify(value);
      expect(response).toContain("Private Name");
      for (const secret of ["private@usc.edu", "Personal bio", "Secret note", "INTJ"]) expect(response).not.toContain(secret);
    }
    expect(publicPlan(privateProfile).score).toBeNull();
    expect(publicPlan(privateProfile, { ...privateProfile, id: "viewer", break_id: "winter" }).score).toBe(0);
  });
  it("escapes typed map queries and supports US search", () => {
    const url = new URL(mapUrl("Los Angeles & Santa Monica", true));
    expect(url.origin).toBe("https://www.google.com"); expect(url.searchParams.get("query")).toBe("Los Angeles & Santa Monica, United States");
  });
});

describe("upcoming weekend dates", () => {
  it("starts with this weekend, keeps Sunday in the current weekend, and crosses year boundaries", async () => {
    const { upcomingWeekends } = await import("@/lib/weekends");
    expect(upcomingWeekends(new Date(2026,9,22))[0]).toEqual({start:"2026-10-24",end:"2026-10-25"});
    expect(upcomingWeekends(new Date(2026,9,25))[0]).toEqual({start:"2026-10-24",end:"2026-10-25"});
    expect(upcomingWeekends(new Date(2026,11,31),2)).toEqual([{start:"2027-01-02",end:"2027-01-03"},{start:"2027-01-09",end:"2027-01-10"}]);
  });
});
