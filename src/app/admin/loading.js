export default function AdminLoading() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header skeleton */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="ms-skeleton" style={{ width: 200, height: 24, borderRadius: 6 }} />
        <div className="ms-skeleton" style={{ width: 120, height: 32, borderRadius: 6 }} />
      </div>

      {/* Metrics row skeleton */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="ms-card" style={{ padding: 18 }}>
            <div className="ms-skeleton" style={{ width: "60%", height: 12, borderRadius: 4, marginBottom: 10 }} />
            <div className="ms-skeleton" style={{ width: "40%", height: 22, borderRadius: 4 }} />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="ms-card" style={{ padding: 0, overflow: "hidden" }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{ display: "flex", gap: 16, padding: "14px 18px", borderBottom: "1px solid var(--ms-border)" }}>
            <div className="ms-skeleton" style={{ width: "25%", height: 14, borderRadius: 4 }} />
            <div className="ms-skeleton" style={{ width: "20%", height: 14, borderRadius: 4 }} />
            <div className="ms-skeleton" style={{ width: "15%", height: 14, borderRadius: 4 }} />
            <div className="ms-skeleton" style={{ width: "20%", height: 14, borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
