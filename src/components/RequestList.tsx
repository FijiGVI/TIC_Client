"use client";

import {
  IconArrowRight,
  IconClock,
  IconFilePlus,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { NewRequestModal } from "@/components/NewRequestModal";
import { Pagination } from "@/components/Pagination";
import { useAuth } from "@/features/auth/AuthProvider";
import { api } from "@/lib/api";
import type { DepartmentOption, PaginationMeta, ServiceRequest } from "@/lib/types";

type Filter = "all" | "open" | "completed";
const statusLabel = (status: string) => status.replaceAll("_", " ");
const initialMeta: PaginationMeta = { page: 1, pageSize: 20, total: 0, totalPages: 1 };
const roleLabels = {
  admin: "Administrator",
  request_manager: "Request manager",
  approver: "Approver",
  requester: "Requester",
} as const;

export function RequestList({ managed = false, allowCreate = false }: { managed?: boolean; allowCreate?: boolean }) {
  const { user } = useAuth();
  const canCreate = allowCreate && Boolean(user?.permissions.includes("requests.create"));
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [selected, setSelected] = useState<ServiceRequest | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta>(initialMeta);
  const [summary, setSummary] = useState({ total: 0, open: 0, completed: 0 });
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [stepResponses, setStepResponses] = useState<Record<string, unknown>>({});
  const selectedStep = selected?.currentStep === null || selected?.currentStep === undefined ? null : selected.formSnapshot.workflowSteps[selected.currentStep];
  const selectedStepFields = selectedStep && selected
    ? selected.formSnapshot.fields.filter((field) => field.stepId === selectedStep.id)
    : [];
  const canCompleteSelectedStep = Boolean(
    selectedStep &&
    user &&
    (selectedStep.approverActorId === user.id ||
      (selectedStep.allowedRoles || [selectedStep.approverRole]).includes(user.role)),
  );
  const currentStepFor = (request: ServiceRequest) =>
    request.currentStep === null || request.currentStep === undefined
      ? null
      : request.formSnapshot.workflowSteps[request.currentStep] || null;
  const isPendingForCurrentUser = (request: ServiceRequest) => {
    const step = currentStepFor(request);
    return Boolean(
      step &&
      user &&
      request.status === "in_review" &&
      (step.approverActorId === user.id ||
        (step.allowedRoles || [step.approverRole]).includes(user.role)),
    );
  };
  const requiredStepFieldsComplete = selectedStepFields.every((field) => {
    if (!field.required) return true;
    const value = stepResponses[field.id];
    return field.type === "checkbox" ? value === true : String(value ?? "").trim().length > 0;
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const parameters = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (filter !== "all") parameters.set("status", filter);
      if (query.trim()) parameters.set("search", query.trim());
      if (managed && departmentId) parameters.set("departmentId", departmentId);
      if (managed && createdFrom) parameters.set("createdFrom", new Date(createdFrom).toISOString());
      if (managed && createdTo) parameters.set("createdTo", new Date(createdTo).toISOString());
      const response = await api.get<{
        data: ServiceRequest[];
        meta: PaginationMeta;
        summary: { total: number; open: number; completed: number };
      }>(`/requests?${parameters}`);
      setRequests(response.data);
      setMeta(response.meta);
      setSummary(response.summary);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load requests",
      );
    } finally {
      setLoading(false);
    }
  }, [createdFrom, createdTo, departmentId, filter, managed, page, query]);

  useEffect(() => {
    if (!managed) return;
    const timer = window.setTimeout(() => void api.get<{ data: DepartmentOption[] }>("/departments").then((response) => setDepartments(response.data)).catch(() => undefined), 0);
    return () => window.clearTimeout(timer);
  }, [managed]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  const act = async (action: "approve" | "reject") => {
    if (!selected || acting) return;
    setActing(true);
    setError("");
    try {
      await api.post(`/requests/${selected.id}/workflow-action`, { action, responses: action === "approve" ? stepResponses : {} });
      setSelected(null);
      setStepResponses({});
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to update request",
      );
    } finally {
      setActing(false);
    }
  };

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            {managed ? "Team workspace" : "Your workspace"}
          </p>
          <h1>{managed ? "Service requests" : "My requests"}</h1>
          <p>
            {managed
              ? "Review assigned work and keep every request moving."
              : "Track requests from submission through completion."}
          </p>
        </div>
        <div className="page-actions">
          <button
            className="icon-button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh requests"
          >
            <IconRefresh size={18} />
          </button>
          {canCreate && (
            <button className="primary" type="button" onClick={() => setCreateOpen(true)}>
              <IconFilePlus size={18} />
              New request
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      <section className="stats">
        <article>
          <span>Total requests</span>
          <strong>{summary.total}</strong>
          <small>All time</small>
        </article>
        <article>
          <span>In progress</span>
          <strong>{summary.open}</strong>
          <small>Needs attention</small>
        </article>
        <article>
          <span>Completed</span>
          <strong>{summary.completed}</strong>
          <small>Successfully closed</small>
        </article>
      </section>

      <section className="surface request-surface">
        <div className="surface-toolbar request-toolbar">
          <div className="segmented" aria-label="Filter requests">
            {(["all", "open", "completed"] as Filter[]).map((option) => (
              <button
                className={filter === option ? "selected" : ""}
                key={option}
                onClick={() => { setFilter(option); setPage(1); }}
              >
                {option}
              </button>
            ))}
          </div>
          <label className="search">
            <IconSearch size={18} />
            <input
              aria-label="Search requests"
              placeholder="Search reference, service, or requester"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            />
          </label>
        </div>
        {managed && <div className="request-filters"><label>Department<select value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setPage(1); }}><option value="">All departments</option>{departments.map((department) => <option value={department.id} key={department.id}>{department.title ? `${department.title} — ` : ""}{department.businessUnit}</option>)}</select></label><label>Submitted from<input type="datetime-local" value={createdFrom} onChange={(event) => { setCreatedFrom(event.target.value); setPage(1); }} /></label><label>Submitted until<input type="datetime-local" value={createdTo} min={createdFrom} onChange={(event) => { setCreatedTo(event.target.value); setPage(1); }} /></label><button className="secondary" type="button" disabled={!departmentId && !createdFrom && !createdTo} onClick={() => { setDepartmentId(""); setCreatedFrom(""); setCreatedTo(""); setPage(1); }}>Clear filters</button></div>}

        <div className="request-table">
          <div className={`request-row heading ${managed ? "managed" : ""}`}>
            <span>Reference</span>
            <span>Request</span>
            {managed && <span>Requester</span>}
            {managed && <span>Department</span>}
            <span>Current step</span>
            <span>Status</span>
            <span>Submitted</span>
            <span />
          </div>
          {loading && !requests.length && (
            <div className="empty">
              <div className="spinner" />
              <h3>Loading requests</h3>
            </div>
          )}
          {!loading &&
            requests.map((request) => (
              <button
                className={`request-row ${managed ? "managed" : ""}`}
                key={request.id}
                onClick={() => { setSelected(request); setStepResponses({}); }}
              >
                <strong>{request.referenceNumber}</strong>
                <span className="request-name">
                  {request.formSnapshot.name}
                </span>
                {managed && (
                  <span>
                    {request.requesterSnapshot.name || "Not available"}
                  </span>
                )}
                {managed && <span>{request.departmentSnapshot?.code || request.departmentSnapshot?.name || "Not available"}</span>}
                <span className="current-step-cell">
                  {currentStepFor(request) ? (
                    <>
                      <strong>{currentStepFor(request)?.name}</strong>
                      {isPendingForCurrentUser(request) && <em>Pending your action</em>}
                    </>
                  ) : (
                    <small>Workflow complete</small>
                  )}
                </span>
                <span className="status-cell">
                  <em className={`status ${request.status}`}>
                    {statusLabel(request.status)}
                  </em>
                </span>
                <span className="submitted-cell">
                  {new Date(request.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <IconArrowRight className="row-arrow" size={17} />
              </button>
            ))}
          {!loading && !requests.length && (
            <div className="empty">
              <IconClock size={34} />
              <h3>No matching requests</h3>
              <p>Try another search or filter.</p>
            </div>
          )}
        </div>
        <Pagination meta={meta} disabled={loading} onPageChange={setPage} />
      </section>

      {selected && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section
            className="modal request-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close request details"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <p className="eyebrow">{selected.referenceNumber}</p>
            <h2 id="request-title">{selected.formSnapshot.name}</h2>
            <div className="detail-meta">
              <span className={`status ${selected.status}`}>
                {statusLabel(selected.status)}
              </span>
              <span>
                Submitted {new Date(selected.createdAt).toLocaleString()}
              </span>
            </div>
            {selectedStep && (
              <div className={`workflow-state ${canCompleteSelectedStep ? "pending-for-you" : ""}`}>
                <div>
                  <small>Current workflow step</small>
                  <strong>{selectedStep.name}</strong>
                  <span>
                    Assigned to {(selectedStep.allowedRoles || [selectedStep.approverRole])
                      .map((role) => roleLabels[role])
                      .join(", ")}
                  </span>
                </div>
                <em>{canCompleteSelectedStep ? "Pending your action" : "Waiting for assigned role"}</em>
              </div>
            )}
            <h3>Request details</h3>
            <dl>
              {selected.departmentSnapshot && <div><dt>Department</dt><dd>{selected.departmentSnapshot.code ? `${selected.departmentSnapshot.code} — ` : ""}{selected.departmentSnapshot.name}</dd></div>}
              {Object.entries(selected.responses).map(([key, value]) => (
                <div key={key}>
                  <dt>
                    {selected.formSnapshot.fields.find(
                      (field) => field.id === key,
                    )?.label || key}
                  </dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
            {!!selected.events?.length && (
              <>
                <h3>Activity</h3>
                <div className="timeline">
                  {selected.events.map((event) => (
                    <div key={event.id}>
                      <i />
                      <p>
                        <strong>{statusLabel(event.action)}</strong>
                        <small>
                          {event.actorSnapshot?.name || "System"} ·{" "}
                          {new Date(event.createdAt).toLocaleString()}
                        </small>
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
            {canCompleteSelectedStep && selectedStep && selectedStepFields.length > 0 && (
              <>
                <h3>{selectedStep.name} fields</h3>
                {selectedStep.instructions && <p>{selectedStep.instructions}</p>}
                <div className="dynamic-fields step-response-fields">
                  {selectedStepFields.map((field) => (
                    <label key={field.id}>
                      {field.label}{field.required && <span aria-hidden="true"> *</span>}
                      <small>{field.description}</small>
                      {field.type === "textarea" ? (
                        <textarea required={field.required} value={String(stepResponses[field.id] || "")} onChange={(event) => setStepResponses({ ...stepResponses, [field.id]: event.target.value })} />
                      ) : field.type === "select" ? (
                        <select required={field.required} value={String(stepResponses[field.id] || "")} onChange={(event) => setStepResponses({ ...stepResponses, [field.id]: event.target.value })}>
                          <option value="">Select one</option>
                          {field.options.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      ) : field.type === "checkbox" ? (
                        <input type="checkbox" checked={Boolean(stepResponses[field.id])} onChange={(event) => setStepResponses({ ...stepResponses, [field.id]: event.target.checked })} />
                      ) : (
                        <input required={field.required} type={field.type} value={String(stepResponses[field.id] || "")} onChange={(event) => setStepResponses({ ...stepResponses, [field.id]: event.target.value })} />
                      )}
                    </label>
                  ))}
                </div>
              </>
            )}
            {canCompleteSelectedStep && selected.status === "in_review" && (
              <div className="modal-actions">
                <button
                  className="danger"
                  disabled={acting}
                  onClick={() => void act("reject")}
                >
                  Reject
                </button>
                <button
                  className="primary"
                  disabled={acting || !requiredStepFieldsComplete}
                  title={requiredStepFieldsComplete ? "Complete this workflow step" : "Complete all required step fields first"}
                  onClick={() => void act("approve")}
                >
                  {acting ? "Updating…" : "Complete step"}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
      {createOpen && <NewRequestModal onClose={() => setCreateOpen(false)} onSubmitted={() => void load()} />}
    </>
  );
}
