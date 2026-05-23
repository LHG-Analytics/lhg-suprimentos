// Layout autenticado — Sidebar + Topbar + AI Chip
// Implementado no LHG-200 (Sprint 0 — Shell)
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* TODO LHG-200: <Sidebar /> */}
      <div className="flex flex-1 flex-col">
        {/* TODO LHG-200: <Topbar /> */}
        <main className="flex-1 p-6">{children}</main>
      </div>
      {/* TODO LHG-200: <AiChip /> */}
    </div>
  );
}
