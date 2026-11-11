"use client";

import {
  IconDeviceFloppy,
  IconEye,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { api } from "@/lib/api";
import { Pagination } from "@/components/Pagination";
import type { FieldType, FormField, PaginationMeta, RequestForm, Role, RoleOption } from "@/lib/types";

type Draft = Omit<RequestForm, "id"> | RequestForm;
// File fields remain readable for backwards compatibility, but cannot be
// created until the TIC API has a multipart upload contract and object-store integration.
const fieldTypes: FieldType[] = [
  "text",
  "textarea",
  "email",
  "date",
  "time",
  "number",
  "select",
  "radio",
  "checkbox",
];
const slug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
const blank = (): Draft => ({
  key: "",
  name: "",
  groupName: "General",
  description: "",
  active: true,
  fields: [],
  workflowSteps: [],
  allowedRequesterRoles: ["requester"],
});
const initialMeta: PaginationMeta = { page: 1, pageSize: 15, total: 0, totalPages: 1 };
const nextBuilderId = (prefix: string, existingIds: string[]): string => {
  let sequence = existingIds.length + 1;
  while (existingIds.includes(`${prefix}_${sequence}`)) sequence += 1;
  return `${prefix}_${sequence}`;
};

const previewStepApplies = (step: Draft["workflowSteps"][number], responses: Record<string, unknown>): boolean => {
  const rules = step.condition?.rules || [];
  if (!rules.length) return true;
  const matches = rules.map((rule) => {
    const value = responses[rule.fieldId];
    const text = value === undefined || value === null ? "" : String(value);
    if (rule.operator === "equals") return text === rule.value;
    if (rule.operator === "not_equals") return text !== rule.value;
    if (rule.operator === "contains") return text.includes(rule.value);
    if (rule.operator === "is_empty") return text === "" || value === false;
    return text !== "" && value !== false;
  });
  return step.condition?.logic === "or" ? matches.some(Boolean) : matches.every(Boolean);
};

function PreviewField({ field, value, onChange }: { field: FormField; value: unknown; onChange(value: unknown): void }) {
  const description = field.description ? <small className="field-description">{field.description}</small> : null;
  const label = <>{field.label}{field.required && <span aria-hidden="true"> *</span>}</>;
  if (field.type === "textarea")
    return (
      <label className="field-wide">
        <span>{label}</span>
        {description}
        <textarea value={String(value || "")} placeholder={field.description} onChange={(event) => onChange(event.target.value)} />
      </label>
    );
  if (field.type === "select")
    return (
      <label>
        <span>{label}</span>
        {description}
        <select value={String(value || "")} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select one</option>
          {field.options.map((option) => <option key={option}>{option}</option>)}
        </select>
      </label>
    );
  if (field.type === "radio")
    return (
      <fieldset>
        <legend>{label}</legend>
        {description}
        {field.options.map((option) => (
          <label className="radio" key={option}>
            <input type="radio" name={`preview-${field.id}`} checked={value === option} onChange={() => onChange(option)} />
            {option}
          </label>
        ))}
      </fieldset>
    );
  if (field.type === "checkbox")
    return (
      <label className="radio">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        {label}
      </label>
    );
  return (
    <label>
      <span>{label}</span>
      {description}
      <input
        type={
          field.type === "image" || field.type === "pdf" ? "file" : field.type
        }
        value={field.type === "image" || field.type === "pdf" ? undefined : String(value || "")}
        placeholder={field.description}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function FormBuilder() {
  const [forms, setForms] = useState<RequestForm[]>([]);
  const [roles, setRoles] = useState<Array<{ value: Role; label: string }>>([]);
  const [draft, setDraft] = useState<Draft>(blank());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewResponses, setPreviewResponses] = useState<Record<string, unknown>>({});
  const [previewStage, setPreviewStage] = useState(0);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [builderTab, setBuilderTab] = useState<"fields" | "steps">("fields");
  const [duplicateTarget, setDuplicateTarget] = useState<{ kind: "field" | "step"; index: number } | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [draftStatus, setDraftStatus] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta>(initialMeta);
  const draftReady = useRef(false);
  const load = useCallback(async () => {
    try {
      const [formResult, roleResult] = await Promise.all([
        api.get<{ data: RequestForm[]; meta: PaginationMeta }>(`/forms?page=${page}&pageSize=100`),
        api.get<{ data: RoleOption[] }>("/roles"),
      ]);
      setForms(formResult.data);
      setMeta(formResult.meta);
      setRoles(roleResult.data.map((role) => ({ value: role.role, label: role.label })));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load forms",
      );
    }
  }, [page]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedDraft = window.localStorage.getItem("tic.form-builder.draft");
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft) as Draft;
          if (parsed && typeof parsed === "object" && Array.isArray(parsed.fields) && Array.isArray(parsed.workflowSteps)) {
            setDraft(parsed);
            setDraftStatus("Recovered local draft");
          }
        } catch {
          window.localStorage.removeItem("tic.form-builder.draft");
        }
      }
      draftReady.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!draftReady.current) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(
        "tic.form-builder.draft",
        JSON.stringify(draft),
      );
      setDraftStatus("Draft saved locally");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft]);
  const generatedKey = useMemo(
    () => ("id" in draft ? draft.key : slug(draft.name)),
    [draft],
  );
  const previewSteps = useMemo(
    () => draft.workflowSteps.filter((step) => previewStepApplies(step, previewResponses)),
    [draft.workflowSteps, previewResponses],
  );
  const currentPreviewStep = previewStage === 0 ? null : previewSteps[previewStage - 1] || null;
  const previewFields = draft.fields.filter((field) => currentPreviewStep ? field.stepId === currentPreviewStep.id : !field.stepId);
  const previewRoleLabel = (role: Role) => roles.find((candidate) => candidate.value === role)?.label || role.replaceAll("_", " ");
  useEffect(() => {
    if (previewStage <= previewSteps.length) return;
    setPreviewStage(previewSteps.length);
  }, [previewStage, previewSteps.length]);
  const patchField = (index: number, patch: Partial<FormField>) =>
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field, currentIndex) =>
        currentIndex === index ? { ...field, ...patch } : field,
      ),
    }));
  const patchStep = (index: number, patch: Partial<(typeof draft.workflowSteps)[number]>) => setDraft((current) => ({ ...current, workflowSteps: current.workflowSteps.map((step, currentIndex) => currentIndex === index ? { ...step, ...patch } : step) }));
  const patchFieldValidation = (
    index: number,
    patch: Partial<FormField["validation"]>,
  ) =>
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field, currentIndex) =>
        currentIndex === index
          ? { ...field, validation: { ...field.validation, ...patch } }
          : field,
      ),
    }));
  const addField = () => {
    const nextIndex = draft.fields.length;
    const id = nextBuilderId("field", draft.fields.map((field) => field.id));
    setDraft((current) => ({
      ...current,
      fields: [
        ...current.fields,
        {
          id,
          label: "New field",
          description: "",
          type: "text",
          required: false,
          options: [],
          stepId: null,
          validation: {},
        },
      ],
    }));
    setEditingFieldIndex(nextIndex);
    setBuilderTab("fields");
  };
  const addStep = () => {
    const nextIndex = draft.workflowSteps.length;
    const id = nextBuilderId("step", draft.workflowSteps.map((step) => step.id));
    setDraft((current) => ({
      ...current,
      workflowSteps: [
        ...current.workflowSteps,
        {
          id,
          name: "Approval",
          instructions: "",
          approverRole: "approver",
          approverUserId: null,
          allowedRoles: ["approver"],
          condition: { logic: "and", rules: [] },
        },
      ],
    }));
    setEditingStepIndex(nextIndex);
    setBuilderTab("steps");
  };
  const duplicateItems = () => {
    if (!duplicateTarget) return;
    const count = Math.min(20, Math.max(1, Math.trunc(duplicateCount)));
    setDraft((current) => {
      const fieldIds = new Set(current.fields.map((field) => field.id));
      const stepIds = new Set(current.workflowSteps.map((step) => step.id));
      const uniqueId = (prefix: string, ids: Set<string>) => {
        let sequence = ids.size + 1;
        while (ids.has(`${prefix}_${sequence}`)) sequence += 1;
        const id = `${prefix}_${sequence}`;
        ids.add(id);
        return id;
      };
      if (duplicateTarget.kind === "field") {
        const source = current.fields[duplicateTarget.index];
        if (!source) return current;
        const copies = Array.from({ length: count }, (_, copyIndex) => ({
          ...source,
          id: uniqueId("field", fieldIds),
          label: `${source.label} (Copy ${copyIndex + 1})`,
          options: [...source.options],
          validation: { ...source.validation },
        }));
        const fields = [...current.fields];
        fields.splice(duplicateTarget.index + 1, 0, ...copies);
        return { ...current, fields };
      }
      const sourceStep = current.workflowSteps[duplicateTarget.index];
      if (!sourceStep) return current;
      const assignedFields = current.fields.filter((field) => field.stepId === sourceStep.id);
      const copiedFields: FormField[] = [];
      const copiedSteps = Array.from({ length: count }, (_, copyIndex) => {
        const stepId = uniqueId("step", stepIds);
        assignedFields.forEach((field) => copiedFields.push({
          ...field,
          id: uniqueId("field", fieldIds),
          label: `${field.label} (Copy ${copyIndex + 1})`,
          stepId,
          options: [...field.options],
          validation: { ...field.validation },
        }));
        return {
          ...sourceStep,
          id: stepId,
          name: `${sourceStep.name} (Copy ${copyIndex + 1})`,
          allowedRoles: [...sourceStep.allowedRoles],
          condition: { ...sourceStep.condition, rules: sourceStep.condition.rules.map((rule) => ({ ...rule })) },
        };
      });
      const workflowSteps = [...current.workflowSteps];
      workflowSteps.splice(duplicateTarget.index + 1, 0, ...copiedSteps);
      return { ...current, workflowSteps, fields: [...current.fields, ...copiedFields] };
    });
    setDuplicateTarget(null);
    setDuplicateCount(1);
  };
  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...draft, key: generatedKey };
      if ("id" in draft) await api.put(`/forms/${draft.id}`, payload);
      else await api.post("/forms", payload);
      window.localStorage.removeItem("tic.form-builder.draft");
      setDraft(blank());
      setDraftStatus("Saved");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save form",
      );
    } finally {
      setSaving(false);
    }
  };
  const keyboardSave = (event: KeyboardEvent<HTMLFormElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      (event.target as HTMLElement).tagName !== "TEXTAREA"
    ) {
      event.preventDefault();
      window.localStorage.setItem(
        "tic.form-builder.draft",
        JSON.stringify(draft),
      );
      setDraftStatus("Draft saved locally");
    }
  };
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1>Form builder</h1>
          <p>Design, preview, assign, and manage employee service forms.</p>
        </div>
        <button className="secondary" onClick={() => setDraft(blank())}>
          <IconPlus size={18} />
          New form
        </button>
      </header>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="builder builder-responsive form-dropdown-builder">
        <aside className="surface">
          <h2>Forms</h2>
          {forms.map((form) => (
            <button
              className={
                "id" in draft && draft.id === form.id ? "selected" : ""
              }
              key={form.id}
              onClick={() => setDraft(form)}
            >
              <strong>{form.name}</strong>
              <small>
                {form.active ? "Active" : "Inactive"} · {form.fields.length}{" "}
                fields
                {form.createdAt
                  ? ` · Created ${new Date(form.createdAt).toLocaleString()} by ${form.creator?.name || "system"}`
                  : ""}
                {form.updatedAt
                  ? ` · Updated ${new Date(form.updatedAt).toLocaleString()} by ${form.updater?.name || "system"}`
                  : ""}
              </small>
            </button>
          ))}
          <Pagination meta={meta} disabled={saving} onPageChange={setPage} />
        </aside>
        <section className="surface editor">
          <div className="form-selector-panel">
            <label>
              Select a form
              <select value={"id" in draft ? String(draft.id) : "new"} onChange={(event) => {
                if (event.target.value === "new") { setDraft(blank()); setDraftStatus("New form"); return; }
                const selected = forms.find((form) => String(form.id) === event.target.value);
                if (selected) { setDraft(selected); setDraftStatus(""); setPreview(false); }
              }}>
                <option value="new">New form</option>
                {forms.map((form) => <option key={form.id} value={String(form.id)}>{form.name} ({form.active ? "Active" : "Inactive"})</option>)}
              </select>
              <small>Choose a form to view its information and edit its contents.</small>
            </label>
            {"id" in draft && <div className="form-identification">
              <div><span>Form</span><strong>{draft.name}</strong></div>
              <div><span>Group</span><strong>{draft.groupName}</strong></div>
              <div><span>Status</span><strong>{draft.active ? "Active" : "Inactive"}</strong></div>
              <div><span>Fields</span><strong>{draft.fields.length}</strong></div>
              <div><span>Created</span><strong>{draft.createdAt ? new Date(draft.createdAt).toLocaleString() : "Not available"}</strong><small>by {draft.creator?.name || "System"}</small></div>
              <div><span>Last updated</span><strong>{draft.updatedAt ? new Date(draft.updatedAt).toLocaleString() : "Not available"}</strong><small>by {draft.updater?.name || "System"}</small></div>
            </div>}
          </div>
          <form onSubmit={save} onKeyDown={keyboardSave}>
            <div className="editor-actions">
              <small>{draftStatus}</small>
              <button
                type="button"
                className="secondary"
                onClick={() => setPreview((value) => {
                  if (!value) { setPreviewResponses({}); setPreviewStage(0); }
                  return !value;
                })}
              >
                <IconEye size={17} />
                {preview ? "Edit form" : "Live preview"}
              </button>
            </div>
            {preview ? (
              <div className="form-preview">
                <div className="preview-mode-banner"><span>Live preview</span><small>Try the fields and workflow. Preview values are not saved.</small></div>
                <p className="eyebrow">{draft.groupName}</p>
                <h2>{draft.name || "Untitled form"}</h2>
                <p>{draft.description}</p>
                <nav className="preview-workflow" aria-label="Preview workflow">
                  <button type="button" className={previewStage === 0 ? "active" : ""} onClick={() => setPreviewStage(0)}>
                    <span>1</span><strong>Request details</strong><small>Requester</small>
                  </button>
                  {previewSteps.map((step, index) => {
                    const stepRoles = step.allowedRoles?.length ? step.allowedRoles : [step.approverRole];
                    return <button type="button" className={previewStage === index + 1 ? "active" : ""} onClick={() => setPreviewStage(index + 1)} key={step.id}>
                      <span>{index + 2}</span><strong>{step.name || `Step ${index + 1}`}</strong><small>{stepRoles.map(previewRoleLabel).join(", ")}</small>
                    </button>;
                  })}
                </nav>
                <div className="preview-current-step">
                  <div><small>Current step</small><strong>{currentPreviewStep?.name || "Request details"}</strong></div>
                  <div><small>Acting role</small><strong>{currentPreviewStep ? (currentPreviewStep.allowedRoles?.length ? currentPreviewStep.allowedRoles : [currentPreviewStep.approverRole]).map(previewRoleLabel).join(", ") : "Requester"}</strong></div>
                </div>
                {currentPreviewStep?.instructions && <p className="preview-step-instructions">{currentPreviewStep.instructions}</p>}
                <div className="dynamic-fields">
                  {previewFields.map((field) => (
                    <PreviewField field={field} key={field.id} value={previewResponses[field.id]} onChange={(value) => setPreviewResponses((current) => ({ ...current, [field.id]: value }))} />
                  ))}
                </div>
                {!previewFields.length && <div className="preview-empty">No fields are assigned to this step.</div>}
                <div className="preview-navigation">
                  <button type="button" className="secondary" disabled={previewStage === 0} onClick={() => setPreviewStage((stage) => Math.max(0, stage - 1))}>Previous step</button>
                  <button type="button" className="primary" disabled={previewStage >= previewSteps.length} onClick={() => setPreviewStage((stage) => Math.min(previewSteps.length, stage + 1))}>Next step</button>
                </div>
              </div>
            ) : (
              <>
                <div className="form-grid">
                  <label>
                    Form name
                    <input
                      required
                      value={draft.name}
                      onChange={(event) =>
                        setDraft({ ...draft, name: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Unique key
                    <input
                      readOnly
                      aria-readonly="true"
                      value={generatedKey}
                      className="readonly"
                    />
                  </label>
                  <label>
                    Group
                    <input
                      required
                      value={draft.groupName}
                      onChange={(event) =>
                        setDraft({ ...draft, groupName: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Status
                    <select
                      value={draft.active ? "active" : "inactive"}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          active: event.target.value === "active",
                        })
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                  <label className="wide">
                    Description
                    <textarea
                      value={draft.description}
                      onChange={(event) =>
                        setDraft({ ...draft, description: event.target.value })
                      }
                    />
                  </label>
                </div>
                <fieldset className="audience">
                  <legend>Available to</legend>
                  {roles.map((role) => (
                    <label className="check" key={role.value}>
                      <input
                        type="checkbox"
                        checked={draft.allowedRequesterRoles.includes(
                          role.value,
                        )}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            allowedRequesterRoles: event.target.checked
                              ? [...draft.allowedRequesterRoles, role.value]
                              : draft.allowedRequesterRoles.filter(
                                  (value) => value !== role.value,
                                ),
                          })
                        }
                      />
                      {role.label}
                    </label>
                  ))}
                </fieldset>
                <div className="builder-tabs" role="tablist" aria-label="Form configuration">
                  <button type="button" role="tab" aria-selected={builderTab === "fields"} className={builderTab === "fields" ? "active" : ""} onClick={() => setBuilderTab("fields")}>Fields <span>{draft.fields.length}</span></button>
                  <button type="button" role="tab" aria-selected={builderTab === "steps"} className={builderTab === "steps" ? "active" : ""} onClick={() => setBuilderTab("steps")}>Workflow steps <span>{draft.workflowSteps.length}</span></button>
                </div>
                {builderTab === "fields" && <>
                <div className="section-title">
                  <div>
                    <h3>Form fields</h3>
                    <p>Fields appear in this order to requesters.</p>
                  </div>
                </div>
                <div className="builder-accordion">
                  {draft.fields.map((field, index) => {
                    const stepName = field.stepId ? draft.workflowSteps.find((step) => step.id === field.stepId)?.name || "Unknown step" : "Requester submission";
                    return <details key={field.id || index}>
                      <summary>
                        <span className="builder-item-number">{index + 1}</span>
                        <span className="builder-item-title"><strong>{field.label || `Field ${index + 1}`}</strong><small>{field.type} · {stepName}{field.required ? " · Required" : ""}</small></span>
                        <span className="builder-item-actions"><button type="button" className="secondary compact" onClick={(event) => { event.preventDefault(); setDuplicateTarget({ kind: "field", index }); setDuplicateCount(1); }}>Duplicate</button><button type="button" className="secondary compact" onClick={(event) => { event.preventDefault(); setEditingFieldIndex(index); }}>Edit</button></span>
                      </summary>
                      <div className="builder-item-details">
                        <p>{field.description || "No help text provided."}</p>
                        {field.options.length > 0 && <p><strong>Options:</strong> {field.options.join(", ")}</p>}
                        <p><strong>Field ID:</strong> <code>{field.id}</code></p>
                      </div>
                    </details>;
                  })}
                  {!draft.fields.length && <div className="builder-empty-list">No fields yet. Add the first field to begin.</div>}
                </div>
                {editingFieldIndex !== null && draft.fields[editingFieldIndex] && <div className="modal-backdrop builder-editor-backdrop" onMouseDown={() => setEditingFieldIndex(null)}>
                  <section className="modal builder-config-modal" role="dialog" aria-modal="true" aria-labelledby="field-editor-title" onMouseDown={(event) => event.stopPropagation()}>
                    <header className="builder-modal-heading"><div><p className="eyebrow">Form field</p><h2 id="field-editor-title">Edit {draft.fields[editingFieldIndex].label || `Field ${editingFieldIndex + 1}`}</h2></div><button type="button" aria-label="Close field editor" onClick={() => setEditingFieldIndex(null)}><IconX size={20}/></button></header>
                    <div className="builder-modal-body"><div className="field-editor improved">
                  {draft.fields.map((field, index) => (
                    index !== editingFieldIndex ? null :
                    <article key={index}>
                      <header className="field-card-header">
                        <div>
                          <span>{index + 1}</span>
                          <strong>Field {index + 1}</strong>
                        </div>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(event) =>
                              patchField(index, {
                                required: event.target.checked,
                              })
                            }
                          />
                          Required
                        </label>
                        <button
                          className="field-delete"
                          type="button"
                          aria-label="Remove field"
                          onClick={() => {
                            setDraft({
                              ...draft,
                              fields: draft.fields.filter(
                                (_, currentIndex) => currentIndex !== index,
                              ),
                            });
                            setEditingFieldIndex(null);
                          }}
                        >
                          <IconTrash size={17} />
                        </button>
                      </header>
                      <div className="field-settings-grid">
                        <label>
                          Field label
                          <input
                            value={field.label}
                            onChange={(event) =>
                              patchField(index, {
                                label: event.target.value,
                                id: (
                                  slug(event.target.value).replaceAll("-", "_") ||
                                  `field_${index + 1}`
                                ).slice(0, 50),
                              })
                            }
                          />
                        </label>
                        <label>
                          Field ID
                          <input readOnly className="readonly" value={field.id} />
                        </label>
                        <label>
                          Field type
                          <select
                            value={field.type}
                            onChange={(event) =>
                              patchField(index, {
                                type: event.target.value as FieldType,
                              })
                            }
                          >
                            {fieldTypes.map((type) => (
                              <option key={type}>{type}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Completed by
                          <select value={field.stepId || ""} onChange={(event) => patchField(index,{stepId:event.target.value||null})}>
                            <option value="">Requester submission</option>
                            {draft.workflowSteps.map((step)=><option value={step.id} key={step.id}>{step.name}</option>)}
                          </select>
                        </label>
                      </div>
                      <label className="field-help">
                        Help text or instructions
                        <textarea
                          placeholder="Explain what information should be entered in this field."
                          value={field.description}
                          onChange={(event) =>
                            patchField(index, { description: event.target.value })
                          }
                        />
                      </label>
                      {["select", "radio"].includes(field.type) && (
                        <textarea
                          className="options"
                          aria-label="Field options"
                          placeholder="One option per line, or separate options with commas"
                          value={field.options.join("\n")}
                          onChange={(event) =>
                            patchField(index, {
                              options: event.target.value
                                .split(/[\n,]/)
                                .map((value) => value.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      )}
                      {["text", "textarea", "email"].includes(field.type) && (
                        <fieldset className="validation-editor">
                          <legend>Validation rules</legend>
                          <label>
                            Minimum length
                            <input
                              type="number"
                              min="0"
                              max="10000"
                              value={field.validation.minLength ?? ""}
                              onChange={(event) =>
                                patchFieldValidation(index, {
                                  minLength: event.target.value === "" ? undefined : event.target.valueAsNumber,
                                })
                              }
                            />
                          </label>
                          <label>
                            Maximum length
                            <input
                              type="number"
                              min="1"
                              max="10000"
                              value={field.validation.maxLength ?? ""}
                              onChange={(event) =>
                                patchFieldValidation(index, {
                                  maxLength: event.target.value === "" ? undefined : event.target.valueAsNumber,
                                })
                              }
                            />
                          </label>
                          <label className="validation-pattern">
                            Pattern (regular expression)
                            <input
                              type="text"
                              maxLength={300}
                              placeholder="Example: ^ABC-[0-9]{4}$"
                              value={field.validation.pattern ?? ""}
                              onChange={(event) =>
                                patchFieldValidation(index, { pattern: event.target.value || undefined })
                              }
                            />
                          </label>
                          <label>
                            Pattern flags
                            <select
                              value={field.validation.patternFlags ?? ""}
                              disabled={!field.validation.pattern}
                              onChange={(event) =>
                                patchFieldValidation(index, { patternFlags: event.target.value || undefined })
                              }
                            >
                              <option value="">Case-sensitive</option>
                              <option value="i">Ignore case (i)</option>
                              <option value="m">Multiline (m)</option>
                              <option value="im">Ignore case + multiline</option>
                            </select>
                          </label>
                          <label className="validation-message">
                            Error message
                            <input
                              type="text"
                              maxLength={300}
                              placeholder="Explain the required format"
                              value={field.validation.message ?? ""}
                              onChange={(event) =>
                                patchFieldValidation(index, { message: event.target.value || undefined })
                              }
                            />
                          </label>
                          <small className="validation-help">
                            Rules are checked in the browser and enforced again by the API.
                          </small>
                        </fieldset>
                      )}
                      {field.type === "number" && (
                        <fieldset className="validation-editor numeric-validation">
                          <legend>Validation rules</legend>
                          <label>
                            Minimum value
                            <input
                              type="number"
                              value={field.validation.min ?? ""}
                              onChange={(event) =>
                                patchFieldValidation(index, {
                                  min: event.target.value === "" ? undefined : event.target.valueAsNumber,
                                })
                              }
                            />
                          </label>
                          <label>
                            Maximum value
                            <input
                              type="number"
                              value={field.validation.max ?? ""}
                              onChange={(event) =>
                                patchFieldValidation(index, {
                                  max: event.target.value === "" ? undefined : event.target.valueAsNumber,
                                })
                              }
                            />
                          </label>
                        </fieldset>
                      )}
                    </article>
                  ))}
                    </div></div>
                    <footer className="builder-modal-footer"><button type="button" className="primary" onClick={() => setEditingFieldIndex(null)}>Done</button></footer>
                  </section>
                </div>}
                </>}
                {builderTab === "steps" && <>
                <div className="section-title">
                  <div>
                    <h3>Approval workflow</h3>
                    <p>Each step is completed sequentially.</p>
                  </div>
                </div>
                <div className="builder-accordion">
                  {draft.workflowSteps.map((step, index) => {
                    const stepRoles = step.allowedRoles?.length ? step.allowedRoles : [step.approverRole];
                    return <details key={step.id}>
                      <summary>
                        <span className="builder-item-number">{index + 1}</span>
                        <span className="builder-item-title"><strong>{step.name || `Step ${index + 1}`}</strong><small>{stepRoles.map(previewRoleLabel).join(", ")} · {(step.condition?.rules || []).length} condition(s)</small></span>
                        <span className="builder-item-actions"><button type="button" className="secondary compact" onClick={(event) => { event.preventDefault(); setDuplicateTarget({ kind: "step", index }); setDuplicateCount(1); }}>Duplicate</button><button type="button" className="secondary compact" onClick={(event) => { event.preventDefault(); setEditingStepIndex(index); }}>Edit</button></span>
                      </summary>
                      <div className="builder-item-details"><p>{step.instructions || "No instructions provided."}</p><p><strong>Completed by:</strong> {stepRoles.map(previewRoleLabel).join(", ")}</p></div>
                    </details>;
                  })}
                  {!draft.workflowSteps.length && <div className="builder-empty-list">No approval steps. Requests will remain submitted without a review workflow.</div>}
                </div>
                {editingStepIndex !== null && draft.workflowSteps[editingStepIndex] && <div className="modal-backdrop builder-editor-backdrop" onMouseDown={() => setEditingStepIndex(null)}>
                  <section className="modal builder-config-modal" role="dialog" aria-modal="true" aria-labelledby="step-editor-title" onMouseDown={(event) => event.stopPropagation()}>
                    <header className="builder-modal-heading"><div><p className="eyebrow">Approval workflow</p><h2 id="step-editor-title">Edit {draft.workflowSteps[editingStepIndex].name || `Step ${editingStepIndex + 1}`}</h2></div><button type="button" aria-label="Close step editor" onClick={() => setEditingStepIndex(null)}><IconX size={20}/></button></header>
                    <div className="builder-modal-body"><div className="field-editor improved">
                  {draft.workflowSteps.map((step, index) => (
                    index !== editingStepIndex ? null :
                    <article key={step.id}>
                      <div className="field-row workflow-config-row">
                        <span>{index + 1}</span>
                        <input
                          value={step.name}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              workflowSteps: draft.workflowSteps.map(
                                (item, currentIndex) =>
                                  currentIndex === index
                                    ? { ...item, name: event.target.value }
                                    : item,
                              ),
                            })
                          }
                        />
                        <div className="step-role-list"><small>Roles allowed to complete this step</small>{roles.map((role)=>{const checked=(step.allowedRoles||[step.approverRole]).includes(role.value);return <label className="check" key={role.value}><input type="checkbox" checked={checked} onChange={(event)=>{const current=step.allowedRoles||[step.approverRole];const allowedRoles=event.target.checked?[...new Set([...current,role.value])]:current.filter((value)=>value!==role.value);if(allowedRoles.length)patchStep(index,{allowedRoles,approverRole:allowedRoles[0]});}}/>{role.label}</label>;})}</div>
                        <button
                          type="button"
                          aria-label="Remove workflow step"
                          onClick={() => {
                            setDraft({
                              ...draft,
                              workflowSteps: draft.workflowSteps.filter(
                                (_, currentIndex) => currentIndex !== index,
                              ),
                              fields: draft.fields.map((field) => field.stepId === step.id ? { ...field, stepId: null } : field),
                            });
                            setEditingStepIndex(null);
                          }}
                        >
                          <IconTrash size={17} />
                        </button>
                      </div>
                      <label className="step-instructions">
                        Step instructions
                        <textarea
                          value={step.instructions}
                          placeholder="Explain what the assigned role must review or complete in this step."
                          onChange={(event) =>
                            patchStep(index, { instructions: event.target.value })
                          }
                        />
                      </label>
                      <div className="step-condition-editor"><div><strong>Conditions (show this step only if…)</strong><select value={step.condition?.logic||"and"} onChange={(event)=>patchStep(index,{condition:{logic:event.target.value as "and"|"or",rules:step.condition?.rules||[]}})}><option value="and">All conditions match (AND)</option><option value="or">Any condition matches (OR)</option></select></div>{(step.condition?.rules||[]).map((rule,ruleIndex)=><div className="condition-rule" key={ruleIndex}><select value={rule.fieldId} onChange={(event)=>{const rules=[...(step.condition?.rules||[])];rules[ruleIndex]={...rule,fieldId:event.target.value};patchStep(index,{condition:{logic:step.condition?.logic||"and",rules}});}}><option value="">Select an earlier field</option>{draft.fields.filter((field)=>!field.stepId||draft.workflowSteps.findIndex((candidate)=>candidate.id===field.stepId)<index).map((field)=><option value={field.id} key={field.id}>{field.label}</option>)}</select><select value={rule.operator} onChange={(event)=>{const rules=[...(step.condition?.rules||[])];rules[ruleIndex]={...rule,operator:event.target.value as typeof rule.operator};patchStep(index,{condition:{logic:step.condition?.logic||"and",rules}});}}><option value="equals">Equals</option><option value="not_equals">Does not equal</option><option value="contains">Contains</option><option value="is_empty">Is empty</option><option value="is_not_empty">Is not empty</option></select>{!rule.operator.includes("empty")&&<input value={rule.value} placeholder="Value" onChange={(event)=>{const rules=[...(step.condition?.rules||[])];rules[ruleIndex]={...rule,value:event.target.value};patchStep(index,{condition:{logic:step.condition?.logic||"and",rules}});}}/>}<button type="button" aria-label="Remove condition" onClick={()=>patchStep(index,{condition:{logic:step.condition?.logic||"and",rules:(step.condition?.rules||[]).filter((_,current)=>current!==ruleIndex)}})}><IconTrash size={15}/></button></div>)}<button type="button" className="secondary compact" onClick={()=>patchStep(index,{condition:{logic:step.condition?.logic||"and",rules:[...(step.condition?.rules||[]),{fieldId:"",operator:"equals",value:""}]}})}><IconPlus size={15}/>Add condition</button></div>
                    </article>
                  ))}
                    </div></div>
                    <footer className="builder-modal-footer"><button type="button" className="primary" onClick={() => setEditingStepIndex(null)}>Done</button></footer>
                  </section>
                </div>}
                </>}
                <div className="builder-floating-actions" aria-label="Builder actions">
                  <button type="button" onClick={addField}><IconPlus size={18}/><span>Add field</span></button>
                  <button type="button" onClick={addStep}><IconPlus size={18}/><span>Add step</span></button>
                </div>
                {duplicateTarget && <div className="modal-backdrop builder-editor-backdrop" onMouseDown={() => setDuplicateTarget(null)}>
                  <section className="modal duplicate-builder-modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-builder-title" onMouseDown={(event) => event.stopPropagation()}>
                    <button type="button" className="modal-close" aria-label="Close duplicate dialog" onClick={() => setDuplicateTarget(null)}><IconX size={20}/></button>
                    <p className="eyebrow">Duplicate {duplicateTarget.kind}</p>
                    <h2 id="duplicate-builder-title">How many copies?</h2>
                    <p>Each copy receives a unique ID. Duplicated steps also include copies of fields assigned to that step.</p>
                    <label>Number of copies<input type="number" min="1" max="20" step="1" value={duplicateCount} onChange={(event) => setDuplicateCount(event.target.valueAsNumber || 1)}/><small>You can create between 1 and 20 copies at a time.</small></label>
                    <div className="modal-actions"><button type="button" className="secondary" onClick={() => setDuplicateTarget(null)}>Cancel</button><button type="button" className="primary" onClick={duplicateItems}>Create {Math.min(20, Math.max(1, Math.trunc(duplicateCount)))} {Math.min(20, Math.max(1, Math.trunc(duplicateCount))) === 1 ? "copy" : "copies"}</button></div>
                  </section>
                </div>}
              </>
            )}
            <div className="save-bar">
              <small>
                {"id" in draft && draft.updatedAt
                  ? `Last updated ${new Date(draft.updatedAt).toLocaleString()}`
                  : "New form"}
              </small>
              <button
                className="primary"
                disabled={saving || !draft.allowedRequesterRoles.length}
              >
                <IconDeviceFloppy size={17} />
                {saving ? "Saving…" : "Save form"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
