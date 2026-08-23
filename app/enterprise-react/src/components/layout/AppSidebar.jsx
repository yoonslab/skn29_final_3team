import {
  BookOpen,
  Building2,
  ChevronDown,
  FileBarChart,
  MessageSquareText,
  X,
} from "lucide-react";
import { PAGE_PATHS } from "../../routing";

const NAVIGATION = [
  { id: "chat", path: PAGE_PATHS.chat, label: "분석 Agent", icon: MessageSquareText, group: "workspace" },
  { id: "reports", path: PAGE_PATHS.reports, label: "보고서", icon: FileBarChart, group: "workspace" },
  { id: "catalog", path: PAGE_PATHS.catalog, label: "DataHub 카탈로그", icon: BookOpen, group: "data" },
];

const ACTIVE_ACCENT_STYLE = {
  position: "absolute",
  left: 0,
  top: "8px",
  bottom: "8px",
  width: "2px",
  borderRadius: "2px",
  background: "var(--gold, #d8b77d)",
};

const GROUP_LABELS = { workspace: "WORKSPACE", data: "DATA" };

export function AppSidebar({ page, onNavigate, open, onClose }) {
  const renderGroup = (group) => (
    <>
      <small className="nav-group" style={{ textTransform: "uppercase" }}>{GROUP_LABELS[group]}</small>
      {NAVIGATION.filter((item) => item.group === group).map(({ id, path, label, icon: Icon }) => {
        const isActive = page === id;
        return (
          <button
            className={isActive ? "active" : ""}
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              onNavigate(path);
              onClose();
            }}
            key={id}
            style={{ position: "relative" }}
          >
            {isActive ? <span aria-hidden="true" style={ACTIVE_ACCENT_STYLE} /> : null}
            <Icon size={18} />
            <span>{label}</span>
          </button>
        );
      })}
    </>
  );

  return (
    <>
      {open && <button className="scrim" aria-label="메뉴 닫기" onClick={onClose} />}
      <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">AS</div>
          <div>
            <b>ANSWERVICE</b>
            <small>Enterprise Intelligence</small>
          </div>
          <button onClick={onClose} aria-label="메뉴 닫기">
            <X size={18} />
          </button>
        </div>
        <nav>
          {renderGroup("workspace")}
          {renderGroup("data")}
        </nav>
        <div className="organization">
          <Building2 size={20} />
          <div>
            <b>Sense Place Hotel</b>
            <small>Demo Organization</small>
          </div>
          <ChevronDown size={15} />
        </div>
      </aside>
    </>
  );
}
