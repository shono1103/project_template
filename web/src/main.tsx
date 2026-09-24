import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router";
import "./style.css";

type Status = {
  database: string;
  schemaVersion: number;
  counts: { cases: number; tasks: number; qas: number };
};

function useStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/status")
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Status>;
      })
      .then(setStatus)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);
  return { status, error };
}

const pages = [
  { path: "/", label: "概要" },
  { path: "/cases", label: "案件" },
  { path: "/tasks", label: "タスク" },
  { path: "/qas", label: "QA" },
];

function Dashboard() {
  const { status, error } = useStatus();
  return <>
    <h1>プロジェクトの概要</h1>
    <p className="lead">案件と作業を管理するための準備ができています。</p>
    {error && <p role="alert">DBの状態を取得できませんでした: {error}</p>}
    <div className="cards">
      <Link to="/cases" className="card"><span>案件</span><strong>{status?.counts.cases ?? "—"}</strong></Link>
      <Link to="/tasks" className="card"><span>タスク</span><strong>{status?.counts.tasks ?? "—"}</strong></Link>
      <Link to="/qas" className="card"><span>QA</span><strong>{status?.counts.qas ?? "—"}</strong></Link>
    </div>
    {status && <p className="meta">SQLite スキーマ v{status.schemaVersion} · {status.database}</p>}
  </>;
}

function Placeholder({ title }: { title: string }) {
  return <>
    <h1>{title}</h1>
    <p className="lead">この画面の機能は、ユースケースの確定後に追加します。</p>
    <Link to="/">概要に戻る</Link>
  </>;
}

function App() {
  return <div className="layout">
    <aside className="sidebar">
      <Link className="brand" to="/">raprid</Link>
      <nav aria-label="メインナビゲーション">
        {pages.map((page) => <NavLink key={page.path} to={page.path} end={page.path === "/"}>{page.label}</NavLink>)}
      </nav>
    </aside>
    <main>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cases" element={<Placeholder title="案件" />} />
        <Route path="/tasks" element={<Placeholder title="タスク" />} />
        <Route path="/qas" element={<Placeholder title="QA" />} />
        <Route path="*" element={<Placeholder title="ページが見つかりません" />} />
      </Routes>
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<BrowserRouter><App /></BrowserRouter>);
