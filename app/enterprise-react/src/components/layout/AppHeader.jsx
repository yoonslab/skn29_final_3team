import { CircleAlert, Menu, RefreshCw } from "lucide-react";

const SYNTHETIC_PILL_STYLE = {
  padding: "6px 10px",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  color: "var(--gold, #a77a3d)",
  border: "1px solid var(--gold, #a77a3d)",
  borderRadius: "999px",
  background: "transparent",
  fontSize: "10.5px",
  fontWeight: 700,
  letterSpacing: "0.12em",
};

export function AppHeader({ title, description, onMenu }) {
  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={onMenu} aria-label="메뉴 열기">
        <Menu size={20} />
      </button>
      <div>
        <p>ENTERPRISE INTELLIGENCE</p>
        <h1>{title}</h1>
        <span>{description}</span>
      </div>
      <div className="top-actions">
        <span className="synthetic-pill" style={SYNTHETIC_PILL_STYLE} aria-label="합성 데모 데이터 안내">SYNTHETIC DEMO</span>
        <button aria-label="새로고침"><RefreshCw size={16} /></button>
        <button aria-label="알림"><CircleAlert size={16} /></button>
        <div className="avatar">A</div>
      </div>
    </header>
  );
}
