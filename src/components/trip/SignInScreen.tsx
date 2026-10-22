import { useState } from "react";
import { PrimaryButton, Screen } from "./ui";
import { isUscEmail, isTravelerName } from "@/lib/sign-in";

type Props = {
  name: string;
  onNameChange: (name: string) => void;
  email: string;
  onEmailChange: (email: string) => void;
  onContinue: () => void;
  ssoEnabled: boolean;
  onSso: () => Promise<void>;
  restoring?: boolean;
  error?: string | null;
};

export function SignInScreen({ name, onNameChange, email, onEmailChange, onContinue, ssoEnabled, onSso, restoring = false, error }: Props) {
  const [busy, setBusy] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const invalid = (submitted || email.length > 0) && !isUscEmail(email);

  const nameInvalid = submitted && !isTravelerName(name);
  const nameField = <div className="mb-5"><label htmlFor="traveler-name" className="mb-2 block text-sm font-semibold">First name</label><input id="traveler-name" name="given-name" autoComplete="given-name" maxLength={60} value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="e.g. Steven" aria-invalid={nameInvalid} aria-describedby={nameInvalid ? "name-error" : undefined} className="h-14 w-full rounded-xl border-2 border-border bg-background px-4 outline-none focus:border-primary focus:ring-2 focus:ring-ring/30" />{nameInvalid && <p id="name-error" role="alert" className="mt-2 text-sm text-destructive">Enter your first name.</p>}</div>;

  async function signIn() {
    setSubmitted(true);
    if (!isTravelerName(name)) return;
    setBusy(true);
    setSsoError(null);
    try { await onSso(); }
    catch { setSsoError(ssoEnabled ? "USC sign-in is unavailable. Please try again or contact the team." : "USC sign-in isn’t connected yet. Use Continue to try the prototype."); }
    finally { setBusy(false); }
  }

  return (
    <Screen>
      <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center py-8">
        <p className="mb-3 text-sm font-semibold text-primary">USC Marshall MSBA</p>
        <h1 className="text-4xl font-extrabold">Your next trip starts here.</h1>
        <p className="mt-3 text-muted-foreground">Find classmates to travel with.</p>
        <section aria-labelledby="signin-heading" className="trip-frame mt-8 overflow-hidden p-5">
          <h2 id="signin-heading" className="text-2xl font-bold">Welcome to TripMatch</h2>
          {ssoEnabled ? (
            <>
              <p className="mt-2 mb-6 text-sm text-muted-foreground">Continue with your USC account.</p>
              {nameField}
              <PrimaryButton onClick={signIn} disabled={busy || restoring} aria-busy={busy || restoring}>
                {restoring ? "Signing you in…" : busy ? "Connecting…" : "Sign in with USC"}
              </PrimaryButton>
            </>
          ) : (
            <form className="mt-6" onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
              if (!busy && isTravelerName(name) && isUscEmail(email)) onContinue();
            }} noValidate>
              {nameField}
              <label htmlFor="usc-email" className="mb-2 block text-sm font-semibold">USC email</label>
              <input id="usc-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
                value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@usc.edu"
                aria-invalid={invalid} aria-describedby={invalid ? "email-error" : undefined}
                className="h-14 w-full rounded-xl border-2 border-border bg-background px-4 outline-none focus:border-primary focus:ring-2 focus:ring-ring/30" />
              {invalid && <p id="email-error" role="alert" className="mt-2 text-sm text-destructive">Enter your @usc.edu email.</p>}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <PrimaryButton type="submit" disabled={busy}>Continue</PrimaryButton>
                <a href="https://my.usc.edu/" target="_blank" rel="noopener noreferrer"
                  aria-describedby="usc-link-note" onClick={() => setSsoError("TripMatch login failed: USC approval is still needed to connect USC sign-in. Return to this tab and use Continue to try the prototype.")}
                  className="flex h-14 items-center justify-center rounded-xl border border-primary bg-card px-2 text-center text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  Sign in with USC
                </a>
              </div>
              <p id="usc-link-note" className="mt-3 text-xs text-muted-foreground">Continue skips email verification. USC sign-in opens in a new tab and still needs USC approval.</p>
            </form>
          )}
          {(ssoError || error) && <p role="alert" className="mt-4 text-sm text-destructive">{ssoError || error}</p>}
        </section>
      </main>
    </Screen>
  );
}
