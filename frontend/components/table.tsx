export type EmailRow = {
  id: string;
  toEmail: string;
  subject: string;
  sendAt: string;
  sentAt?: string | null;
  status: string;
  failureReason?: string | null;
};

export function EmailTable({
  rows,
  loading,
  activeTab = "scheduled"
}: {
  rows: EmailRow[];
  loading: boolean;
  activeTab?: "all" | "scheduled" | "sent";
}) {
  if (loading) return <div className="empty">Loading emails…</div>;
  if (!rows.length) {
    return (
      <div className="empty" style={{ padding: "40px 20px", textAlign: "center" }}>
        <p style={{ margin: "0 0 6px", fontWeight: 500 }}>
          {activeTab === "scheduled"
            ? "No pending scheduled emails."
            : activeTab === "sent"
            ? "No sent emails yet."
            : "No emails found."}
        </p>
        <span style={{ fontSize: "13px", color: "var(--muted)" }}>
          {activeTab === "scheduled"
            ? "Delivered emails automatically move to the 'Sent Emails' tab."
            : "Compose an email to schedule and deliver messages."}
        </span>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Recipient</th>
            <th>Subject</th>
            <th>{activeTab === "sent" ? "Sent At" : "Scheduled Time"}</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const dateToDisplay = activeTab === "sent" && row.sentAt ? row.sentAt : row.sendAt;
            return (
              <tr key={row.id}>
                <td>{row.toEmail}</td>
                <td style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.subject}
                </td>
                <td>{new Date(dateToDisplay).toLocaleString()}</td>
                <td>
                  <span className={`badge ${row.status.toLowerCase()}`}>{row.status}</span>
                  {row.failureReason && (
                    <div style={{ color: "#ef4444", fontSize: "11px", marginTop: "4px" }}>
                      {row.failureReason}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
