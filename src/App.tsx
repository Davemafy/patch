import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";

const ACTIVE_REPAIR_KEY = "patch.activeRepairId";

type ViewCandidate = {
  _id: string;
  name: string;
  website: string;
  email?: string;
  serviceEvidence: string;
  sourceUrl: string;
  chosen: boolean;
  outreach: null | {
    status: "sending" | "sent" | "failed";
    error?: string;
  };
  reply: null | {
    rawText: string;
    canTakeJob: boolean | null;
    arrivalText: string | null;
    priceAmount: number | null;
    currency: string | null;
    note: string | null;
    extractionStatus: "ok" | "failed";
  };
};

type RepairView = {
  repair: {
    _id: string;
    description: string;
    area: string;
    status: "reported" | "looking" | "waiting" | "options_ready" | "chosen";
    category?: string;
    chosenCandidateId?: string;
    lastError?: string;
    photoUrl?: string | null;
  };
  candidates: ViewCandidate[];
};

function money(amount: number | null, currency: string | null) {
  if (amount == null) return "Not stated";
  if ((currency || "").toUpperCase() === "NGN") return `₦${amount.toLocaleString("en-NG")}`;
  if (currency) return `${currency.toUpperCase()} ${amount.toLocaleString()}`;
  return amount.toLocaleString();
}

function hostLabel(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ""); }
  catch { return value; }
}

function Mark() {
  return <span className="mark" aria-label="Patch">Patch<span>.</span></span>;
}

function Arrow() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M14 6l6 6-6 6" /></svg>;
}

function Tick() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

function FrameHeader({ onNew, dark = false }: { onNew?: () => void; dark?: boolean }) {
  return (
    <header className={`masthead ${dark ? "masthead-dark" : ""}`}>
      <Mark />
      <div className="masthead-rule" />
      {onNew ? <button className="quiet-action" onClick={onNew}>New repair</button> : <span className="masthead-note">Repair concierge</span>}
    </header>
  );
}

function App() {
  const [activeRepairId, setActiveRepairId] = useState<string | null>(() => localStorage.getItem(ACTIVE_REPAIR_KEY));
  const [reporting, setReporting] = useState(false);
  const repairView = useQuery(
    anyApi.repairs.getRepair,
    activeRepairId ? { repairId: activeRepairId } : "skip",
  ) as RepairView | null | undefined;

  useEffect(() => {
    if (activeRepairId) localStorage.setItem(ACTIVE_REPAIR_KEY, activeRepairId);
    else localStorage.removeItem(ACTIVE_REPAIR_KEY);
  }, [activeRepairId]);

  useEffect(() => {
    if (repairView === null) setActiveRepairId(null);
  }, [repairView]);

  if (!activeRepairId) {
    return reporting ? (
      <ReportScreen
        onCancel={() => setReporting(false)}
        onCreated={(id) => {
          setActiveRepairId(id);
          setReporting(false);
        }}
      />
    ) : <HomeScreen onStart={() => setReporting(true)} />;
  }

  if (repairView === undefined) return <LoadingShell />;
  if (!repairView) return <HomeScreen onStart={() => setReporting(true)} />;
  return <RepairScreen view={repairView} onNew={() => setActiveRepairId(null)} />;
}

function HomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="screen home-page">
      <div className="frame home-frame">
        <FrameHeader dark />
        <section className="home-stage">
          <div className="hero-copy">
            <h1>Something broke.<br /><em>We’ll make the calls.</em></h1>
            <p>Tell Patch once. We find people who actually handle it, ask for price and timing, and bring their replies back to you.</p>
            <button className="hero-action" onClick={onStart}>Start a repair <Arrow /></button>
          </div>

          <div className="story" aria-label="Example Patch conversation">
            <div className="story-entry story-you">
              <span>You</span>
              <p>Bedroom doorknob turns, but the door won’t open.</p>
            </div>
            <div className="story-entry">
              <span>Patch</span>
              <p>Found people who repair door hardware. Asking now.</p>
            </div>
            <div className="story-entry story-reply">
              <span>Reply</span>
              <blockquote>“Tomorrow afternoon. Callout is ₦12,000.”</blockquote>
            </div>
            <p className="story-foot">Real people. Real replies. Nothing filled in by Patch.</p>
          </div>
        </section>

        <footer className="home-signature">
          <span>Search less.</span>
          <span>Call nobody.</span>
          <span>Choose from what people actually said.</span>
        </footer>
      </div>
    </main>
  );
}

function ReportScreen({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const createRepair = useMutation(anyApi.repairs.createRepair);
  const generateUploadUrl = useMutation(anyApi.repairs.generateUploadUrl);
  const discover = useAction(anyApi.discovery.findRepairPeople);
  const [description, setDescription] = useState("");
  const [area, setArea] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let photoStorageId: string | undefined;
      if (photo) {
        if (!photo.type.startsWith("image/")) throw new Error("Choose an image file.");
        if (photo.size > 5 * 1024 * 1024) throw new Error("Keep the photo under 5 MB.");
        const uploadUrl = await generateUploadUrl({});
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": photo.type },
          body: photo,
        });
        if (!response.ok) throw new Error("Photo upload failed. Try again without it.");
        photoStorageId = (await response.json()).storageId;
      }

      const repairId = await createRepair({ description, area, photoStorageId });
      onCreated(repairId as string);
      void discover({ repairId }).catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Patch couldn't start this repair.");
      setBusy(false);
    }
  }

  return (
    <main className="screen paper-screen report-page">
      <div className="frame">
        <header className="masthead">
          <button className="quiet-action" onClick={onCancel}>Back</button>
          <div className="masthead-rule" />
          <Mark />
        </header>

        <section className="report-layout">
          <div className="report-prompt">
            <h1>Say it like you’d text a friend.</h1>
            <p>No categories. No diagnosis. Just what happened and where you are.</p>
          </div>

          <form className="report-card" onSubmit={submit}>
            <label className="editorial-field">
              <span>What happened?</span>
              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="My bedroom doorknob is broken. The handle turns but the door won’t open properly."
                maxLength={1200}
                required
              />
            </label>

            <label className="editorial-field">
              <span>Where?</span>
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Wuse 2, Abuja"
                maxLength={120}
                required
              />
            </label>

            <div className="photo-line">
              <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
              <button type="button" onClick={() => photoInput.current?.click()}>{photo ? "Change photo" : "Add a photo"}</button>
              <span>{photo ? photo.name : "Optional"}</span>
            </div>

            {photo && <button type="button" className="remove-photo" onClick={() => setPhoto(null)}>Remove photo</button>}
            {error && <p className="inline-error">{error}</p>}

            <button className="submit-repair" disabled={busy}>
              {busy ? "Starting…" : <>Find someone <Arrow /></>}
            </button>

            <p className="truth-line">Patch leaves price, time and availability blank until a person says them.</p>
          </form>
        </section>
      </div>
    </main>
  );
}

function RepairScreen({ view, onNew }: { view: RepairView; onNew: () => void }) {
  const { repair, candidates } = view;
  const discover = useAction(anyApi.discovery.findRepairPeople);
  const askPeople = useAction(anyApi.mail.askRepairPeople);
  const choose = useMutation(anyApi.repairs.chooseRepairPerson);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const selectableIds = useMemo(
    () => candidates
      .filter((c) => c.email && (!c.outreach || (c.outreach.status === "failed" && /not configured in Convex/.test(c.outreach.error || ""))))
      .map((c) => c._id),
    [candidates],
  );

  useEffect(() => {
    setSelected((current) => current.length ? current.filter((id) => selectableIds.includes(id)) : selectableIds);
  }, [selectableIds.join("|")]);

  const replies = candidates.filter((candidate) => candidate.reply);
  const chosen = candidates.find((candidate) => candidate.chosen);
  const contactable = candidates.filter((candidate) => candidate.email);
  const shownCandidates = contactable.length ? contactable : candidates;

  async function retryDiscovery() {
    setBusy(true);
    setLocalError(null);
    try { await discover({ repairId: repair._id }); }
    catch (e) { setLocalError(e instanceof Error ? e.message : "Search failed."); }
    finally { setBusy(false); }
  }

  async function sendRequests() {
    if (!selected.length) return;
    setBusy(true);
    setLocalError(null);
    try { await askPeople({ candidateIds: selected }); }
    catch (e) { setLocalError(e instanceof Error ? e.message : "Messages couldn't be sent."); }
    finally { setBusy(false); }
  }

  async function chooseCandidate(candidateId: string) {
    setBusy(true);
    setLocalError(null);
    try { await choose({ repairId: repair._id, candidateId }); }
    catch (e) { setLocalError(e instanceof Error ? e.message : "That choice couldn't be saved."); }
    finally { setBusy(false); }
  }

  if (repair.status === "chosen" && chosen) {
    return <DoneScreen repair={repair} candidate={chosen} onNew={onNew} />;
  }

  const finding = (repair.status === "reported" || repair.status === "looking") && candidates.length === 0 && !repair.lastError;
  const peopleFound = candidates.length > 0 && candidates.every((candidate) => !candidate.outreach) && replies.length === 0;
  const waiting = candidates.some((candidate) => candidate.outreach?.status === "sent") && replies.length === 0;
  const outreachFailed = replies.length === 0 && !waiting && candidates.some((candidate) => candidate.outreach?.status === "failed");

  return (
    <main className="screen paper-screen repair-page">
      <div className="frame">
        <FrameHeader onNew={onNew} />

        <section className="repair-intro">
          <span>{repair.area}</span>
          <h1>{repair.description}</h1>
          {repair.photoUrl && <img src={repair.photoUrl} alt="Repair" />}
        </section>

        {finding && <LookingState />}

        {repair.lastError && candidates.length === 0 && (
          <section className="quiet-state">
            <h2>Search stalled.</h2>
            <p>{repair.lastError}</p>
            <button onClick={retryDiscovery} disabled={busy}>{busy ? "Trying again…" : "Try again"}</button>
          </section>
        )}

        {peopleFound && (
          <section className="results-v2 provider-section">
            <div className="section-open">
              <h2>{shownCandidates.length === 1 ? "One person worth asking." : `${shownCandidates.length} people worth asking.`}</h2>
              <p>These are direct matches we can reach. No one is marked available until they reply.</p>
            </div>

            <div className="provider-list">
              {shownCandidates.map((candidate, index) => (
                <ProviderRow
                  key={candidate._id}
                  candidate={candidate}
                  index={index}
                  selected={selected.includes(candidate._id)}
                  onToggle={() => setSelected((current) =>
                    current.includes(candidate._id)
                      ? current.filter((id) => id !== candidate._id)
                      : [...current, candidate._id],
                  )}
                />
              ))}
            </div>

            {candidates.length > shownCandidates.length && (
              <p className="muted-note">{candidates.length - shownCandidates.length} source match{candidates.length - shownCandidates.length === 1 ? "" : "es"} omitted because Patch could not find a public way to reach them.</p>
            )}

            {(localError || candidates.some((c) => c.outreach?.error)) && (
              <p className="inline-error">{localError || "One of the messages couldn't be sent."}</p>
            )}

            <button className="bottom-action" disabled={!selected.length || busy} onClick={sendRequests}>
              {busy ? "Sending…" : <>Ask {selected.length || "them"} for price + time <Arrow /></>}
            </button>
          </section>
        )}

        {waiting && <WaitingState candidates={candidates} />}

        {outreachFailed && (
          <section className="quiet-state">
            <h2>Message didn’t go out.</h2>
            <p>{candidates.find((candidate) => candidate.outreach?.status === "failed")?.outreach?.error || "Try again."}</p>
            {selectableIds.length > 0 && <button onClick={sendRequests} disabled={busy}>{busy ? "Trying again…" : "Try again"}</button>}
          </section>
        )}

        {replies.length > 0 && (
          <section className="reply-section">
            <div className="section-open">
              <h2>Replies are in.</h2>
              <p>Patch only pulls out what was actually stated. Missing details stay missing.</p>
            </div>

            <div className="reply-list">
              {candidates.map((candidate) =>
                candidate.reply
                  ? <ReplyBlock key={candidate._id} candidate={candidate} onChoose={() => chooseCandidate(candidate._id)} busy={busy} />
                  : <PendingLine key={candidate._id} candidate={candidate} />
              )}
            </div>
            {localError && <p className="inline-error">{localError}</p>}
          </section>
        )}

        <details className="system-proof">
          <summary>How Patch got here</summary>
          <p>Search evidence comes from public pages. Outreach runs through AgentMail. Replies land in Convex and are conservatively extracted by OpenAI GPT-OSS served through Groq.</p>
        </details>
      </div>
    </main>
  );
}

function ProviderRow({
  candidate,
  index,
  selected,
  onToggle,
}: {
  candidate: ViewCandidate;
  index: number;
  selected: boolean;
  onToggle: () => void;
}) {
  const canContact = Boolean(candidate.email);
  return (
    <article className={`provider-row ${selected ? "is-selected" : ""}`}>
      <span className="provider-index">{String(index + 1).padStart(2, "0")}</span>
      <div className="provider-body">
        <a className="provider-name" href={candidate.sourceUrl} target="_blank" rel="noreferrer">{candidate.name}</a>
        <p className="provider-evidence">“{candidate.serviceEvidence}”</p>
        <div className="provider-meta">
          <span>{hostLabel(candidate.website)}</span>
          <span>{canContact ? "Reachable by email" : "No public email"}</span>
        </div>
      </div>
      <button className="provider-toggle" onClick={onToggle} disabled={!canContact} aria-pressed={selected} aria-label={selected ? `Remove ${candidate.name}` : `Ask ${candidate.name}`}>
        {selected ? <Tick /> : <span>+</span>}
      </button>
    </article>
  );
}

function LookingState() {
  return (
    <section className="looking-state">
      <div className="looking-title">
        <h2>Looking for the right person.<br /><em>Not the longest list.</em></h2>
      </div>
      <div className="search-sequence">
        <div><span>1</span><p>Understand what kind of repair this actually is.</p></div>
        <div className="is-live"><span>2</span><p>Check direct service pages and public contact details.</p></div>
        <div><span>3</span><p>Keep only people we can justify asking.</p></div>
      </div>
    </section>
  );
}

function WaitingState({ candidates }: { candidates: ViewCandidate[] }) {
  const sent = candidates.filter((c) => c.outreach?.status === "sent");
  const failed = candidates.filter((c) => c.outreach?.status === "failed");
  return (
    <section className="waiting-state">
      <div className="section-open waiting-open">
        <span className="qa-label">Messages sent</span>
        <h2>Now we wait for humans.</h2>
        <p>{sent.length} {sent.length === 1 ? "request is" : "requests are"} out. Patch won’t manufacture a quote while we wait.</p>
      </div>

      <div className="sent-list">
        {sent.map((candidate, index) => (
          <div className="sent-line" key={candidate._id}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{candidate.name}</strong>
            <em>Request delivered</em>
          </div>
        ))}
        {failed.map((candidate) => (
          <div className="sent-line is-failed" key={candidate._id}>
            <span>—</span><strong>{candidate.name}</strong><em>Send failed</em>
          </div>
        ))}
      </div>

      <p className="live-note"><i /> Leave this open. A reply appears here live.</p>
    </section>
  );
}

function ReplyBlock({ candidate, onChoose, busy }: { candidate: ViewCandidate; onChoose: () => void; busy: boolean }) {
  const reply = candidate.reply!;
  const unavailable = reply.canTakeJob === false;
  return (
    <article className={`reply-block ${unavailable ? "is-unavailable" : ""}`}>
      <div className="reply-provider">
        <span>{hostLabel(candidate.website)}</span>
        <h3>{candidate.name}</h3>
      </div>

      <blockquote className="reply-quote">“{reply.rawText}”</blockquote>

      <div className="reply-facts">
        <div><span>Can take it?</span><strong>{reply.canTakeJob === true ? "Yes" : reply.canTakeJob === false ? "No" : "Not stated"}</strong></div>
        <div><span>When</span><strong>{reply.arrivalText || "Not stated"}</strong></div>
        <div><span>Price</span><strong>{money(reply.priceAmount, reply.currency)}</strong></div>
      </div>

      {reply.note && <p className="reply-note">{reply.note}</p>}
      {reply.extractionStatus === "failed" && <p className="inline-error">Patch could not safely extract every detail. Use the original reply.</p>}

      <details className="raw-reply">
        <summary>Read original reply</summary>
        <p>{reply.rawText}</p>
      </details>

      {!unavailable && (
        <button className="choose-action" onClick={onChoose} disabled={busy}>
          {busy ? "Saving…" : <>Choose {candidate.name.split(" ")[0]} <Arrow /></>}
        </button>
      )}
    </article>
  );
}

function PendingLine({ candidate }: { candidate: ViewCandidate }) {
  if (!candidate.outreach || candidate.outreach.status !== "sent") return null;
  return <div className="pending-line"><span>{candidate.name}</span><em>Still waiting</em></div>;
}

function DoneScreen({ repair, candidate, onNew }: { repair: RepairView["repair"]; candidate: ViewCandidate; onNew: () => void }) {
  const reply = candidate.reply!;
  return (
    <main className="screen done-page">
      <div className="frame done-frame">
        <FrameHeader onNew={onNew} dark />

        <section className="done-stage">
          <span className="qa-label">Sorted</span>
          <h1>{candidate.name}</h1>
          <p className="done-line">
            {reply?.arrivalText ? <>said <em>{reply.arrivalText}</em></> : <>is your choice</>}
            {reply?.priceAmount != null ? <> · <strong>{money(reply.priceAmount, reply.currency)}</strong></> : null}
          </p>

          <div className="done-receipt">
            <div><span>You said</span><p>{repair.description}</p></div>
            <div><span>They said</span><p>{reply.rawText}</p></div>
          </div>

          <p className="done-truth">Patch didn’t estimate the price, invent the timing, book anyone or take payment. You chose from the reply.</p>
        </section>
      </div>
    </main>
  );
}

function LoadingShell() {
  return (
    <main className="screen home-page loading-page">
      <div className="frame">
        <FrameHeader dark />
        <div className="loading-word">Patch<span>.</span></div>
      </div>
    </main>
  );
}

export default App;
