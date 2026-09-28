"use client";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { Button } from "../../components/button";
import { EmailRow, EmailTable } from "../../components/table";
import { Modal } from "../../components/modal";
import { Input } from "../../components/input";
import { Toast } from "../../components/toast";
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
export default function Dashboard() {
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<"scheduled" | "sent" | "all">("scheduled");
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [counts, setCounts] = useState({ scheduled: 0, sent: 0, failed: 0, all: 0 });
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState(false);
  const [toast, setToast] = useState("");

  const refresh = async () => {
    if (!session?.user?.id) return;
    try {
      const [listRes, countRes] = await Promise.all([
        fetch(`${API}/emails/${tab}?userId=${encodeURIComponent(session.user.id)}`),
        fetch(`${API}/emails/counts?userId=${encodeURIComponent(session.user.id)}`).catch(() => null)
      ]);
      const data = await listRes.json();
      setRows(Array.isArray(data) ? data : []);
      if (countRes && countRes.ok) {
        const c = await countRes.json();
        setCounts(c);
      }
    } catch {
      setToast("Could not load emails");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      setLoading(true);
      fetch(`${API}/users/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          imageUrl: session.user.image
        })
      })
        .then(() => refresh())
        .catch(() => refresh());

      const id = setInterval(refresh, 8000);
      return () => clearInterval(id);
    }
  }, [tab, status, session?.user?.id]);

  if (status === "loading") return <main className="page-loading">Loading your workspace…</main>;
  if (!session) { location.href = "/"; return null; }
  return (
    <main className="dashboard">
      <header>
        <div className="brand"><span>O</span> OUTBIX</div>
        <div className="profile">
          {session.user?.image && <img src={session.user.image} alt="" />}
          <div><b>{session.user?.name}</b><small>{session.user?.email}</small></div>
          <button onClick={() => signOut({ callbackUrl: "/" })}>Log out</button>
        </div>
      </header>
      <section className="hero">
        <div>
          <p className="eyebrow">EMAIL OPERATIONS</p>
          <h1>Campaigns at a glance</h1>
          <p>Reliable scheduling with thoughtful delivery pacing.</p>
        </div>
        <Button onClick={() => setCompose(true)}>+ Compose new email</Button>
      </section>
      <nav className="tabs">
        <button className={tab === "scheduled" ? "active" : ""} onClick={() => setTab("scheduled")}>
          Scheduled Emails {counts.scheduled > 0 && <span className="tab-pill">{counts.scheduled}</span>}
        </button>
        <button className={tab === "sent" ? "active" : ""} onClick={() => setTab("sent")}>
          Sent Emails {counts.sent > 0 && <span className="tab-pill">{counts.sent}</span>}
        </button>
        <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>
          All Emails {counts.all > 0 && <span className="tab-pill">{counts.all}</span>}
        </button>
      </nav>
      <EmailTable rows={rows} loading={loading} activeTab={tab} />
      <Compose
        userId={session.user.id}
        open={compose}
        onClose={() => setCompose(false)}
        onDone={(message) => { setToast(message); setCompose(false); refresh(); }}
      />
      <Toast message={toast} />
    </main>
  );
}
interface SenderItem {
  id: string;
  email: string;
  displayName?: string | null;
}

function Compose({ userId, open, onClose, onDone }: { userId: string; open: boolean; onClose(): void; onDone(message: string): void }) {
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [senderId, setSenderId] = useState("");
  const [sendAt, setSendAt] = useState("");
  const [delay, setDelay] = useState("1000");
  const [hourlyLimit, setHourlyLimit] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatingSender, setCreatingSender] = useState(false);
  const [senders, setSenders] = useState<SenderItem[]>([]);
  const [loadingSenders, setLoadingSenders] = useState(false);

  useEffect(() => {
    if (open && userId) {
      setLoadingSenders(true);
      fetch(`${API}/senders/user/${encodeURIComponent(userId)}`)
        .then(res => res.json())
        .then((data: SenderItem[]) => {
          if (Array.isArray(data)) {
            setSenders(data);
            if (data.length > 0) {
              setSenderId(prev => (prev && data.some(s => s.id === prev) ? prev : data[0].id));
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingSenders(false));

      if (!sendAt) {
        // Default to 5 minutes in future so user has plenty of time to compose without immediate expiration
        const d = new Date(Date.now() + 5 * 60000);
        d.setSeconds(0, 0);
        const tzOffset = d.getTimezoneOffset() * 60000;
        setSendAt(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16));
      }
    }
  }, [open, userId]);

  // Extracting addresses (rather than splitting CSV cells) gracefully handles headers such as "name,email".
  const emails = Array.from(new Set(recipients.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []));
  const upload = (file?: File) => { if (!file) return; file.text().then(setRecipients); };

  function parseLocalDate(localDateTimeStr: string): Date {
    const [datePart, timePart] = localDateTimeStr.split("T");
    if (!datePart || !timePart) return new Date(localDateTimeStr);
    const [year, month, day] = datePart.split("-").map(Number);
    const [hours, minutes] = timePart.split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!senderId) return onDone("Please select or create a sender mailbox first.");
    if (!emails.length) return onDone("Add at least one valid recipient email address.");
    
    const scheduledDate = parseLocalDate(sendAt);
    if (isNaN(scheduledDate.getTime())) {
      return onDone("Please select a valid scheduled date and time.");
    }

    const diffMs = scheduledDate.getTime() - Date.now();
    if (diffMs < -15000) {
      const proceed = confirm("The scheduled time is in the past. This email will be sent immediately upon scheduling. Do you wish to continue?");
      if (!proceed) return;
    }

    setSaving(true);
    try {
      const isoSendAt = scheduledDate.toISOString();
      const r = await fetch(`${API}/emails/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          senderId,
          toEmails: emails,
          subject,
          body,
          sendAt: isoSendAt,
          delayBetweenEmailsMs: Number(delay),
          hourlyLimit: hourlyLimit ? Number(hourlyLimit) : undefined
        })
      });
      if (!r.ok) {
        const result = await r.json().catch(() => null);
        throw new Error(result?.error || "Scheduling failed");
      }
      onDone(
        diffMs > 0
          ? `${emails.length} email(s) scheduled for ${scheduledDate.toLocaleTimeString()}`
          : `${emails.length} email(s) dispatched for delivery!`
      );
    } catch (error) {
      onDone(error instanceof Error ? error.message : "Scheduling failed");
    } finally {
      setSaving(false);
    }
  }

  async function createSender() {
    setCreatingSender(true);
    try {
      const r = await fetch(`${API}/senders/ethereal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId })
      });
      if (!r.ok) {
        const err = await r.json().catch(() => null);
        throw new Error(err?.error || "Could not create Ethereal sender");
      }
      const sender: SenderItem = await r.json();
      setSenders(prev => [sender, ...prev.filter(s => s.id !== sender.id)]);
      setSenderId(sender.id);
    } catch (error) {
      onDone(error instanceof Error ? error.message : "Could not create sender");
    } finally {
      setCreatingSender(false);
    }
  }

  return (
    <Modal open={open} title="Compose new email" onClose={onClose}>
      <form className="compose" onSubmit={submit}>
        <label>
          Sender Mailbox
          {loadingSenders ? (
            <div style={{ padding: "10px 0", color: "var(--muted)", fontSize: "13px" }}>Loading sender mailboxes…</div>
          ) : senders.length > 0 ? (
            <div style={{ display: "flex", gap: "8px", marginTop: "7px" }}>
              <select
                className="input"
                style={{ marginTop: 0, flex: 1 }}
                required
                value={senderId}
                onChange={e => setSenderId(e.target.value)}
              >
                {senders.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.displayName ? `${s.displayName} (${s.email})` : s.email}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={createSender}
                disabled={creatingSender}
                className="button"
                style={{ padding: "10px 14px", fontSize: "12px", whiteSpace: "nowrap" }}
              >
                {creatingSender ? "Creating…" : "+ New Sender"}
              </button>
            </div>
          ) : (
            <div style={{ marginTop: "7px", padding: "14px", border: "1px dashed var(--line)", borderRadius: "10px", textAlign: "center" }}>
              <p style={{ margin: "0 0 10px", color: "var(--muted)", fontSize: "13px" }}>
                No sender mailbox found for this account. Create a test Ethereal sender to begin.
              </p>
              <button
                type="button"
                onClick={createSender}
                disabled={creatingSender}
                className="button"
                style={{ padding: "8px 16px", fontSize: "12px" }}
              >
                {creatingSender ? "Creating…" : "+ Create Ethereal Sender"}
              </button>
            </div>
          )}
        </label>
        <label>
          Recipients <small>{emails.length} detected</small>
          <textarea required value={recipients} onChange={e => setRecipients(e.target.value)} placeholder="one@email.com, two@email.com" />
          <input type="file" accept=".csv,.txt" onChange={e => upload(e.target.files?.[0])} />
        </label>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>Tip: Avoid single-word subjects like "hi" to bypass spam filters.</span>
          <button
            type="button"
            onClick={() => {
              setSubject("Outbix Scheduled Update - Delivery Test");
              setBody("Hello,\n\nThis is an automated test email sent through the Outbix scheduled delivery system.\n\nThe message queue is configured with rate-limiting controls and deliverability headers.\n\nBest regards,\nJayraj Khule");
            }}
            style={{ background: "none", border: "1px dashed var(--line)", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer", color: "var(--green)" }}
          >
            Insert Sample Template
          </button>
        </div>
        <label>Subject<Input required value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Project Update & Campaign Delivery" /></label>
        <label>Message<textarea required value={body} onChange={e => setBody(e.target.value)} placeholder="Write your email body..." /></label>
        <div className="grid">
          <label>Start time<Input required type="datetime-local" value={sendAt} onChange={e => setSendAt(e.target.value)} /></label>
          <label>Delay (ms)<Input required type="number" min="0" value={delay} onChange={e => setDelay(e.target.value)} /></label>
        </div>
        <label>Hourly cap (optional)<Input type="number" min="1" value={hourlyLimit} onChange={e => setHourlyLimit(e.target.value)} placeholder="Uses configured sender cap" /></label>
        <a className="slack" href={`${API}/slack/connect?userId=${encodeURIComponent(userId)}`}>Connect Slack</a>
        <Button disabled={saving}>{saving ? "Scheduling…" : `Schedule ${emails.length || ""} emails`}</Button>
      </form>
    </Modal>
  );
}
