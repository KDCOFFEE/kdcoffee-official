// @ts-expect-error -- Native Node strip-types requires explicit source extensions (repository convention).
import { WORKS_CONTRACT_VERSION, worksIssue, worksOwn, worksRecord, worksReference } from "./worksArtworkContract.ts";
// @ts-expect-error -- Native Node strip-types requires explicit source extensions (repository convention).
import { validateWorksCommand, validateWorksState } from "./worksArtworkValidation.ts";
import type { WorksCandidate, WorksFieldState, WorksManagedField, WorksResult, WorksState, WorksWriteContext } from "./worksArtworkContract.ts";

/** Candidate only. No persistence, token generation, request deduplication or lock is implied. */
export function modelWorksWrite(context: WorksWriteContext, rawCommand: unknown): WorksResult<WorksCandidate> {
  if (!worksRecord(context) || !worksReference(context.targetRef) || typeof context.currentEditToken !== "string" || !/^[A-Za-z0-9._~-]{1,256}$/u.test(context.currentEditToken)) return { ok: false, errors: [worksIssue("INVALID_CONTEXT", "context", "A trusted target and current token are required.")] };
  const command = validateWorksCommand(rawCommand); if (!command.ok) return command;
  let current: WorksState | undefined;
  if (worksOwn(context, "currentState")) {
    const checked = validateWorksState(context.currentState); if (!checked.ok) return checked;
    current = checked.value;
  }
  const revision = current === undefined ? 0 : current.revision;
  if (command.value.targetRef !== context.targetRef) return { ok: false, errors: [worksIssue("TARGET_CONFLICT", "targetRef", "The command targets a different artwork.")] };
  if (command.value.expectedWorksRevision !== revision) return { ok: false, errors: [worksIssue("REVISION_CONFLICT", "expectedWorksRevision", "The Works revision is stale.")] };
  if (command.value.expectedEditToken !== context.currentEditToken) return { ok: false, errors: [worksIssue("EDIT_TOKEN_CONFLICT", "expectedEditToken", "The source edit token is stale.")] };
  if (revision === Number.MAX_SAFE_INTEGER) return { ok: false, errors: [worksIssue("REVISION_LIMIT", "revision", "No safe next revision is available.")] };
  const fields: Partial<Record<WorksManagedField, WorksFieldState>> = {};
  if (current !== undefined) for (const field of Object.keys(current.fields) as WorksManagedField[]) fields[field] = current.fields[field];
  for (const operation of command.value.operations) fields[operation.field] = operation.state;
  const next = { contractVersion: WORKS_CONTRACT_VERSION, revision: revision + 1, fields };
  // Enforce the complete candidate budget, not just each operation's budget.
  const checked = validateWorksState(next); if (!checked.ok) return checked;
  return { ok: true, value: { targetRef: context.targetRef, requestId: command.value.requestId, state: checked.value, nextRevision: checked.value.revision } };
}
