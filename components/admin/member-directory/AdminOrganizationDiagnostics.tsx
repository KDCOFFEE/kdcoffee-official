import type { AdminOrganizationFinding } from "@/lib/adminMemberOrganization";

export function AdminOrganizationDiagnostics({ findings }: { findings: AdminOrganizationFinding[] }) {
  if (!findings.length) return <p className="graph-ok">組織關係驗證正常。</p>;
  return <details className="graph-diagnostics">
    <summary>組織資料異常 {findings.length} 項</summary>
    <ul>{findings.map((finding, index) => <li key={`${finding.code}-${finding.memberId || index}`}><strong>{finding.code}</strong> {finding.message}</li>)}</ul>
  </details>;
}
