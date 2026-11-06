"use client";

import {
  IconDeviceFloppy,
  IconEye,
  IconPlus,
  IconTrash,
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

function PreviewField({ field }: { field: FormField }) {
  if (field.type === "textarea")
    return (
      <label>
        {field.label}
        <textarea disabled placeholder={field.description} />
      </label>
    );
  if (field.type === "select")
    return (
      <label>
        {field.label}
        <select disabled>
          <option>{field.options[0] || "Select one"}</option>
        </select>
      </label>
    );
  if (field.type === "radio")
    return (
      <fieldset>
        <legend>{field.label}</legend>
        {field.options.map((option) => (
          <label className="radio" key={option}>
            <input disabled type="radio" />
            {option}
          </label>
        ))}
      </fieldset>
    );
  if (field.type === "checkbox")
    return (
      <label className="radio">
        <input disabled type="checkbox" />
        {field.label}
      </label>
    );
  return (
    <label>
      {field.label}
      <input
        disabled
        type={
          field.type === "image" || field.type === "pdf" ? "file" : field.type
        }
        placeholder={field.description}
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
  const addField = () =>
    setDraft((current) => ({
      ...current,
      fields: [
        ...current.fields,
        {
          id: `field_${current.fields.length + 1}`,
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
                onClick={() => setPreview((value) => !value)}
              >
                <IconEye size={17} />
                {preview ? "Edit form" : "Live preview"}
              </button>
            </div>
            {preview ? (
              <div className="form-preview">
                <p className="eyebrow">{draft.groupName}</p>
                <h2>{draft.name || "Untitled form"}</h2>
                <p>{draft.description}</p>
                <div className="dynamic-fields">
                  {draft.fields.map((field) => (
                    <PreviewField field={field} key={field.id} />
                  ))}
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
                <div className="section-title">
                  <div>
                    <h3>Form fields</h3>
                    <p>Fields appear in this order to requesters.</p>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={addField}
                  >
                    <IconPlus size={17} />
                    Add field
                  </button>
                </div>
                <div className="field-editor improved">
                  {draft.fields.map((field, index) => (
                    <article key={`${field.id}-${index}`}>
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
                          onClick={() =>
                            setDraft({
                              ...draft,
                              fields: draft.fields.filter(
                                (_, currentIndex) => currentIndex !== index,
                              ),
                            })
                          }
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
                </div>
                <div className="section-title">
                  <div>
                    <h3>Approval workflow</h3>
                    <p>Each step is completed sequentially.</p>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        workflowSteps: [
                          ...draft.workflowSteps,
                          {
                            id: `step_${draft.workflowSteps.length + 1}`,
                            name: "Approval",
                            instructions: "",
                            approverRole: "approver",
                            approverUserId: null,
                            allowedRoles: ["approver"],
                            condition: { logic: "and", rules: [] },
                          },
                        ],
                      })
                    }
                  >
                    <IconPlus size={17} />
                    Add step
                  </button>
                </div>
                <div className="field-editor improved">
                  {draft.workflowSteps.map((step, index) => (
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
                          onClick={() =>
                            setDraft({
                              ...draft,
                              workflowSteps: draft.workflowSteps.filter(
                                (_, currentIndex) => currentIndex !== index,
                              ),
                            })
                          }
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
                </div>
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
