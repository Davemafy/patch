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
  if (amount == null) return "Price not stated";
  if ((currency || "").toUpperCase() === "NGN") return `₦${amount.toLocaleString("en-NG")}`;
  if (currency) return `${currency.toUpperCase()} ${amount.toLocaleString()}`;
  return amount.toLocaleString();
}

function Logo() {
  return <div className="brand">Patch<span>.</span></div>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

function hostLabel(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ""); }
  catch { return value; }
}

function ProgressRail({ status }: { status: RepairView["repair"]["status"] }) {
  const stages = [
    ["reported", "Reported"],
    ["looking", "Sources found"],
    ["waiting", "Asked"],
    ["options_ready", "Reply received"],
    ["chosen", "Chosen"],
  ] as const;
  const order = ["reported", "looking", "waiting", "options_ready", "chosen"];
  const current = order.indexOf(status);
  return (
    <nav className="progress-rail" aria-label="Repair progress">
      {stages.map(([key, label], index) => (
        <div key={key} className={index <= current ? "progress-step active" : "progress-step"}>
          <span>{index < current ? <CheckIcon /> : index + 1}</span>
          <strong>{label}</strong>
        </div>
      ))}
    </nav>
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
    ) : (
      <HomeScreen onStart={() => setReporting(true)} />
    );
  }

  if (repairView === undefined) return <LoadingShell label="Opening your repair" />;
  if (!repairView) return <HomeScreen onStart={() => setReporting(true)} />;

  return <RepairScreen view={repairView} onNew={() => setActiveRepairId(null)} />;
}

function HomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="page home-page home-v2">
      <header className="topbar"><Logo /><span className="top-note">Real repair people. Real replies.</span></header>
      <section className="hero hero-v2">
        <div className="hero-copy">
          <p className="eyebrow">Repair concierge for the small stuff</p>
          <h1>Skip the<br /><em>calling around.</em></h1>
          <p className="lede">Describe what broke once. Patch finds direct providers, asks for real price and timing, then brings their replies back into one place.</p>
          <button className="primary big" onClick={onStart}>Start a repair <ArrowIcon /></button>
          <div className="hero-proof">
            <span><b>01</b> Find direct providers</span>
            <span><b>02</b> Ask them by email</span>
            <span><b>03</b> Compare what they actually said</span>
          </div>
        </div>

        <aside className="hero-demo" aria-label="Example Patch flow">
          <div className="demo-top"><span>Example flow</span><small>Broken doorknob · Abuja</small></div>
          <div className="demo-step"><span className="demo-icon">01</span><div><strong>3 direct providers found</strong><small>Public service evidence checked</small></div></div>
          <div className="demo-step"><span className="demo-icon">02</span><div><strong>2 requests sent</strong><small>Through AgentMail</small></div></div>
          <div className="demo-reply">
            <span>Reply</span>
            <strong>“Tomorrow afternoon. ₦12,000 callout.”</strong>
          </div>
          <div className="demo-truth">Website proves service fit. Only the reply can prove price or timing.</div>
        </aside>
      </section>
      <footer className="home-footer"><span>No directory browsing.</span><span>No invented estimates.</span><span>You choose.</span></footer>
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
        if (!photo.type.startsWith("image/")) throw new Error("Choose an image file for the repair photo.");
        if (photo.size > 5 * 1024 * 1024) throw new Error("Keep the repair photo under 5 MB.");
        const uploadUrl = await generateUploadUrl({});
        const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": photo.type }, body: photo });
        if (!response.ok) throw new Error("The photo couldn't be uploaded. Try again without it.");
        const result = await response.json();
        photoStorageId = result.storageId;
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
    <main className="page report-page">
      <header className="topbar"><button className="text-button" onClick={onCancel}>Back</button><Logo /><span /></header>
      <section className="report-shell">
        <aside className="report-intro">
          <p className="eyebrow">Start a repair</p>
          <h1>One problem.<br />Two details.</h1>
          <p>Tell Patch what happened and where you are. That is enough to start finding people who actually handle it.</p>
          <div className="report-promises">
            <span><b>01</b> No diagnosis needed</span>
            <span><b>02</b> No price guessed from the web</span>
            <span><b>03</b> Real replies stay attached to the repair</span>
          </div>
        </aside>

        <form className="report-form report-card" onSubmit={submit}>
          <label className="field"><span>What happened</span><textarea rows={6} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="My bedroom doorknob is broken. The handle turns but the door won’t open properly." maxLength={1200} required /></label>
          <label className="field"><span>Your area</span><input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Wuse 2, Abuja" maxLength={120} required /></label>
          <div className="photo-row">
            <div><strong>Add a photo</strong><span>Optional · up to 5 MB</span></div>
            <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            <button type="button" className="secondary" onClick={() => photoInput.current?.click()}>{photo ? "Change" : "Add photo"}</button>
          </div>
          {photo && <div className="selected-file"><span>{photo.name}</span><button type="button" onClick={() => setPhoto(null)}>Remove</button></div>}
          {error && <p className="error-callout">{error}</p>}
          <button className="primary big full" disabled={busy}>{busy ? "Starting…" : <>Find people who can fix it <ArrowIcon /></>}</button>
          <p className="truth-note">Price and timing stay blank until a person actually replies.</p>
        </form>
      </section>
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
    () => candidates.filter((c) => c.email && (!c.outreach || (c.outreach.status === "failed" && /not configured in Convex/.test(c.outreach.error || "")))).map((c) => c._id),
    [candidates],
  );
  useEffect(() => {
    setSelected((current) => current.length ? current.filter((id) => selectableIds.includes(id)) : selectableIds);
  }, [selectableIds.join("|")]);

  const replies = candidates.filter((candidate) => candidate.reply);
  const chosen = candidates.find((candidate) => candidate.chosen);
  const contactableCandidates = candidates.filter((candidate) => candidate.email);
  const shownCandidates = contactableCandidates.length > 0 ? contactableCandidates : candidates;

  async function retryDiscovery() {
    setBusy(true); setLocalError(null);
    try { await discover({ repairId: repair._id }); } catch (e) { setLocalError(e instanceof Error ? e.message : "Search failed."); }
    finally { setBusy(false); }
  }

  async function sendRequests() {
    if (!selected.length) return;
    setBusy(true); setLocalError(null);
    try { await askPeople({ candidateIds: selected }); }
    catch (e) { setLocalError(e instanceof Error ? e.message : "Messages couldn't be sent."); }
    finally { setBusy(false); }
  }

  async function chooseCandidate(candidateId: string) {
    setBusy(true); setLocalError(null);
    try { await choose({ repairId: repair._id, candidateId }); }
    catch (e) { setLocalError(e instanceof Error ? e.message : "That choice couldn't be saved."); }
    finally { setBusy(false); }
  }

  if (repair.status === "chosen" && chosen) return <DoneScreen repair={repair} candidate={chosen} onNew={onNew} />;

  const finding = (repair.status === "reported" || repair.status === "looking") && candidates.length === 0 && !repair.lastError;
  const peopleFound = candidates.length > 0 && candidates.every((candidate) => !candidate.outreach) && replies.length === 0;
  const waiting = candidates.some((candidate) => candidate.outreach?.status === "sent") && replies.length === 0;
  const outreachFailed = replies.length === 0 && !waiting && candidates.some((candidate) => candidate.outreach?.status === "failed");

  return (
    <main className="page repair-page">
      <header className="topbar"><Logo /><button className="text-button" onClick={onNew}>New repair</button></header>
      <section className="repair-head">
        <div><p className="eyebrow">Your repair</p><h1>{repair.description}</h1><p className="repair-area">{repair.area}</p></div>
        {repair.photoUrl && <img className="repair-photo" src={repair.photoUrl} alt="Repair" />}
      </section>
      <ProgressRail status={repair.status} />

      {finding && <LookingState />}

      {repair.lastError && candidates.length === 0 && (
        <section className="state-panel">
          <p className="eyebrow">Search paused</p>
          <h2>We didn’t get a clean match.</h2>
          <p>{repair.lastError}</p>
          <button className="primary" onClick={retryDiscovery} disabled={busy}>{busy ? "Trying again…" : "Try the search again"}</button>
        </section>
      )}

      {peopleFound && (
        <section className="results-section results-v2">
          <div className="section-heading">
            <div><p className="eyebrow">Direct matches</p><h2>{shownCandidates.length} {shownCandidates.length === 1 ? "provider" : "providers"} we can reach.</h2></div>
            <p>Each one has public evidence for this kind of work. None is treated as available until they reply.</p>
          </div>
          <div className="people-list">
            {shownCandidates.map((candidate) => (
              <CandidateRow key={candidate._id} candidate={candidate} selected={selected.includes(candidate._id)} onToggle={() => setSelected((current) => current.includes(candidate._id) ? current.filter((id) => id !== candidate._id) : [...current, candidate._id])} />
            ))}
          </div>
          {candidates.length > shownCandidates.length && <p className="secondary-results">{candidates.length - shownCandidates.length} other source match{candidates.length - shownCandidates.length === 1 ? "" : "es"} hidden because Patch could not find a public email.</p>}
          {(localError || candidates.some((c) => c.outreach?.error)) && <p className="error-callout">{localError || "One of the messages couldn't be sent."}</p>}
          <button className="primary big results-cta" disabled={!selected.length || busy} onClick={sendRequests}>{busy ? "Sending…" : <>Ask {selected.length || "them"} for price and time <ArrowIcon /></>}</button>
        </section>
      )}

      {waiting && <WaitingState candidates={candidates} />}

      {outreachFailed && (
        <section className="state-panel">
          <p className="eyebrow">Message not sent</p>
          <h2>We couldn’t send that request.</h2>
          <p>{candidates.find((candidate) => candidate.outreach?.status === "failed")?.outreach?.error || "Check the mail setup and try again."}</p>
          {selectableIds.length > 0 && <button className="primary" onClick={sendRequests} disabled={busy}>{busy ? "Trying again…" : "Try again"}</button>}
        </section>
      )}

      {replies.length > 0 && (
        <section className="results-section replies-section">
          <div className="section-heading"><div><p className="eyebrow">Replies are in</p><h2>Who should take the job?</h2></div><p>Everything below came from their actual replies. If they didn’t state something, Patch leaves it blank.</p></div>
          <div className="reply-list">
            {candidates.map((candidate) => candidate.reply ? <ReplyCard key={candidate._id} candidate={candidate} onChoose={() => chooseCandidate(candidate._id)} busy={busy} /> : <PendingRow key={candidate._id} candidate={candidate} />)}
          </div>
          {localError && <p className="error-callout">{localError}</p>}
        </section>
      )}

      <footer className="repair-footer"><span>Patch only trusts a website for service fit.</span><span>Price and timing come from the person’s reply.</span></footer>
    </main>
  );
}

function CandidateRow({ candidate, selected, onToggle }: { candidate: ViewCandidate; selected: boolean; onToggle: () => void }) {
  const canContact = Boolean(candidate.email);
  return (
    <div className={`candidate-row ${selected ? "selected" : ""}`}>
      <button className="candidate-select" onClick={onToggle} disabled={!canContact} aria-pressed={selected}>
        <span className="check-box">{selected && <CheckIcon />}</span>
        <span className="candidate-main">
          <span className="candidate-title-line"><strong>{candidate.name}</strong><small>{hostLabel(candidate.website)}</small></span>
          <span className="evidence-quote">“{candidate.serviceEvidence}”</span>
        </span>
      </button>
      <div className="candidate-meta">
        <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Open evidence ↗</a>
        <span className={canContact ? "contact-proof" : ""}>{canContact ? "Public email found" : "No public email found"}</span>
      </div>
    </div>
  );
}

function LookingState() {
  return (
    <section className="looking-state">
      <div className="looking-copy">
        <div className="pulse-ring"><span /></div>
        <div><p className="eyebrow">Patch is working</p><h2>From one sentence to real people.</h2><p>We’re turning the repair into search context, checking public service pages, and keeping only evidence-backed matches.</p></div>
      </div>
      <div className="operation-feed" aria-label="Live repair search">
        <div className="operation-row done"><span><CheckIcon /></span><div><strong>Understand the repair</strong><small>OpenAI GPT-OSS · structured context</small></div></div>
        <div className="operation-row live"><span className="mini-pulse" /><div><strong>Search public service pages</strong><small>Firecrawl · service evidence + contact</small></div></div>
        <div className="operation-row"><span>03</span><div><strong>Prepare outreach</strong><small>Only after a public match is found</small></div></div>
      </div>
    </section>
  );
}

function WaitingState({ candidates }: { candidates: ViewCandidate[] }) {
  const sent = candidates.filter((c) => c.outreach?.status === "sent");
  const failed = candidates.filter((c) => c.outreach?.status === "failed");
  return (
    <section className="waiting-state">
      <div className="waiting-copy"><p className="eyebrow">Messages sent</p><h2>Patch is doing the calling around.</h2><p>{sent.length} {sent.length === 1 ? "request is" : "requests are"} out through AgentMail. Nothing shown as price or timing until a person actually replies.</p></div>
      <div className="outbound-stack">
        {sent.map((candidate, index) => (
          <article className="mail-card outbound" key={candidate._id} style={{ ["--stack" as string]: index }}>
            <div className="mail-kicker"><span>OUT</span><small>AgentMail · sent</small></div>
            <strong>{candidate.name}</strong>
            <p>Can you take this repair? When could you come, and roughly what would you charge?</p>
            <div className="mail-foot"><span>{hostLabel(candidate.website)}</span><span>Waiting for reply</span></div>
          </article>
        ))}
        {failed.map((candidate) => <div className="mail-card failed-mail" key={candidate._id}><strong>{candidate.name}</strong><span>Message didn’t send</span></div>)}
      </div>
      <div className="waiting-foot"><span className="live-dot" /> Live via Convex — replies appear here without refresh or copy/paste.</div>
    </section>
  );
}

function ReplyCard({ candidate, onChoose, busy }: { candidate: ViewCandidate; onChoose: () => void; busy: boolean }) {
  const reply = candidate.reply!;
  const unavailable = reply.canTakeJob === false;
  return (
    <article className={`reply-card ${unavailable ? "unavailable" : ""}`}>
      <div className="incoming-mail">
        <div className="mail-kicker"><span>IN</span><small>Real email reply</small></div>
        <div className="incoming-head"><strong>{candidate.name}</strong><span>{hostLabel(candidate.website)}</span></div>
        <p>{reply.rawText}</p>
      </div>
      <div className="extraction-line"><span>OpenAI GPT-OSS extracted only stated facts</span><i /></div>
      <div className="reply-top"><div><p className="reply-name">{candidate.name}</p><span>{reply.canTakeJob === true ? "Can take the job" : reply.canTakeJob === false ? "Can’t take this one" : "Willingness not stated"}</span></div><span className="human-badge">From their reply</span></div>
      <div className="reply-facts">
        <div><span>Willingness</span><strong>{reply.canTakeJob === true ? "Yes" : reply.canTakeJob === false ? "No" : "Not stated"}</strong></div>
        <div><span>When</span><strong>{reply.arrivalText || "Not stated"}</strong></div>
        <div><span>Price</span><strong>{money(reply.priceAmount, reply.currency)}</strong></div>
      </div>
      {reply.note && <p className="reply-note">{reply.note}</p>}
      {reply.extractionStatus === "failed" && <p className="extraction-warning">Patch couldn’t safely pull out the details, so use the original reply above.</p>}
      <details><summary>Read original reply</summary><blockquote>{reply.rawText}</blockquote></details>
      {!unavailable && <button className="primary" onClick={onChoose} disabled={busy}>{busy ? "Saving…" : `Choose ${candidate.name.split(" ")[0]}`}</button>}
    </article>
  );
}

function PendingRow({ candidate }: { candidate: ViewCandidate }) {
  if (!candidate.outreach || candidate.outreach.status !== "sent") return null;
  return <div className="pending-row"><span className="status-dot" /><strong>{candidate.name}</strong><span>Still waiting</span></div>;
}

function DoneScreen({ repair, candidate, onNew }: { repair: RepairView["repair"]; candidate: ViewCandidate; onNew: () => void }) {
  const reply = candidate.reply!;
  return (
    <main className="done-page">
      <header className="topbar"><Logo /><button className="text-button" onClick={onNew}>New repair</button></header>
      <ProgressRail status="chosen" />
      <section className="done-card">
        <div className="done-mark"><CheckIcon /></div>
        <p className="eyebrow">Sorted</p>
        <h1>{candidate.name}{reply?.arrivalText ? <> can come <em>{reply.arrivalText}</em>.</> : <> is your choice.</>}</h1>
        <div className="decision-receipt">
          <div><span>Problem</span><strong>{repair.description}</strong></div>
          <div><span>Provider</span><strong>{candidate.name}</strong></div>
          <div><span>When they said</span><strong>{reply?.arrivalText || "Not stated"}</strong></div>
          <div><span>What they quoted</span><strong>{money(reply?.priceAmount ?? null, reply?.currency ?? null)}</strong></div>
        </div>
        <p className="receipt-truth">Price and timing came from the person’s reply — Patch did not estimate them.</p>
      </section>
      <p className="done-foot">Patch didn’t book or pay anyone. You made the choice.</p>
    </main>
  );
}

function LoadingShell({ label }: { label: string }) {
  return <main className="page loading-page"><header className="topbar"><Logo /><span /></header><div className="loading-center"><div className="pulse-ring"><span /></div><p>{label}</p></div></main>;
}

export default App;
