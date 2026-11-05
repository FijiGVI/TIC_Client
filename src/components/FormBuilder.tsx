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
import type { FieldType, FormField, PaginationMeta, RequestForm, Role } from "@/lib/types";

type Draft = Omit<RequestForm, "id"> | RequestForm;
const roles: Array<{ value: Role; label: string }> = [
  { value: "requester", label: "Requester" },
  { value: "request_manager", label: "Request manager" },
  { value: "approver", label: "Approver" },
  { value: "admin", label: "Administrator" },
];
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
      const result = await api.get<{ data: RequestForm[]; meta: PaginationMeta }>(
        `/forms?page=${page}&pageSize=15`,
      );
      setForms(result.data);
      setMeta(result.meta);
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
      <div className="builder builder-responsive">
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
                      <div className="field-row field-config-row">
                        <span>{index + 1}</span>
                        <input
                          aria-label="Field label"
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
                        <input
                          aria-label="Field ID"
                          readOnly
                          className="readonly"
                          value={field.id}
                        />
                        <select
                          aria-label="Field type"
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
                      </div>
                      <textarea
                        aria-label="Field description"
                        placeholder="Help text or instructions"
                        value={field.description}
                        onChange={(event) =>
                          patchField(index, { description: event.target.value })
                        }
                      />
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
                        <select
                          value={step.approverRole}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              workflowSteps: draft.workflowSteps.map(
                                (item, currentIndex) =>
                                  currentIndex === index
                                    ? {
                                        ...item,
                                        approverRole: event.target.value as
                                          | "admin"
                                          | "request_manager"
                                          | "approver",
                                      }
                                    : item,
                              ),
                            })
                          }
                        >
                          <option value="approver">Approver</option>
                          <option value="request_manager">
                            Request manager
                          </option>
                          <option value="admin">Administrator</option>
                        </select>
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
