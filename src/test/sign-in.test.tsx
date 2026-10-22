import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInScreen } from "@/components/trip/SignInScreen";

vi.mock("@/components/trip/TripAssistant", () => ({ TripAssistant: () => null }));
afterEach(cleanup);
const defaults = { name: "Steven", onNameChange: vi.fn(), email: "", onEmailChange: vi.fn(), onContinue: vi.fn(), ssoEnabled: false, onSso: vi.fn() };

describe("Short sign-in", () => {
  it("requires a name before continuing, without deriving it from the email", () => {
    const next = vi.fn(); render(<SignInScreen {...defaults} name="   " email="student@usc.edu" onContinue={next} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(next).not.toHaveBeenCalled(); expect(screen.getByRole("alert")).toHaveTextContent("Enter your first name");
  });
  it("continues immediately with a USC email without a password or email code", () => {
    const next = vi.fn();
    const { container } = render(<SignInScreen {...defaults} email="student@usc.edu" onContinue={next} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(next).toHaveBeenCalledOnce();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByText(/check your inbox/i)).toBeNull();
  });
  it("rejects an address outside USC", () => {
    const next = vi.fn();
    render(<SignInScreen {...defaults} email="student@usc.edu.example.com" onContinue={next} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(next).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your @usc.edu email.");
  });
  it("opens only the official USC portal and explains the missing approval without authenticating", () => {
    const redirect = vi.fn();
    const next = vi.fn();
    render(<SignInScreen {...defaults} onContinue={next} onSso={redirect} />);
    const link = screen.getByRole("link", { name: "Sign in with USC" });
    expect(link).toHaveAttribute("href", "https://my.usc.edu/");
    expect(link).toHaveAttribute("target", "_blank");
    fireEvent.click(link);
    expect(screen.getByRole("alert")).toHaveTextContent("USC approval is still needed");
    expect(redirect).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
  it("uses the provider redirect in SSO mode without offering prototype bypass", async () => {
    const redirect = vi.fn().mockResolvedValue(undefined);
    render(<SignInScreen {...defaults} ssoEnabled onSso={redirect} />);
    expect(screen.queryByLabelText("USC email")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign in with USC" }));
    await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });
  it("recovers from SSO errors without proceeding as an unverified user", async () => {
    render(<SignInScreen {...defaults} ssoEnabled onSso={vi.fn().mockRejectedValue(new Error("provider missing"))} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with USC" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("USC sign-in is unavailable");
    expect(screen.getByRole("button", { name: "Sign in with USC" })).toBeEnabled();
    expect(defaults.onContinue).not.toHaveBeenCalled();
  });
});
