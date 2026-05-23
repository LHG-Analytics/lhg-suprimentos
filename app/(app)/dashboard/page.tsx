// Dashboard — implementado no LHG-218 (Sprint 6)
// Por enquanto renderiza placeholder para validar o shell
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visão geral de cotações e compras
        </p>
      </div>
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
        Shell funcionando · LHG-197 ✓
      </div>
    </div>
  );
}
