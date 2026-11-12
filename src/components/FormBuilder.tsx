"use client";

import {
  IconDeviceFloppy,
  IconGripVertical,
  IconEye,
  IconPencil,
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
import { fieldIsVisible, initialFieldResponses } from "@/lib/fieldConditions";
import { Pagination } from "@/components/Pagination";
import type { ConditionOperator, FieldCondition, FieldType, FormField, FormGroup, PaginationMeta, RequestForm, Role, RoleOption } from "@/lib/types";

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
  "csv",
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
  groupId: "",
  groupName: "",
  description: "",
  active: true,
  fields: [],
  workflowSteps: [],
  allowedRequesterRoles: ["requester"],
});
const initialMeta: PaginationMeta = { page: 1, pageSize: 15, total: 0, totalPages: 1 };
const fieldValidationIssue = (field: FormField): string | null => {
  const { min, max, minLength, maxLength } = field.validation;
  if (min !== undefined && max !== undefined && max < min) return "Maximum value must be greater than or equal to minimum value.";
  if (minLength !== undefined && maxLength !== undefined && maxLength < minLength) return "Maximum length must be greater than or equal to minimum length.";
  if (field.validation.pattern) {
    try { new RegExp(field.validation.pattern, field.validation.patternFlags); }
    catch { return "Pattern must be a valid regular expression."; }
  }
  if (typeof field.defaultValue === "number") {
    if (min !== undefined && field.defaultValue < min) return "Default value must be greater than or equal to minimum value.";
    if (max !== undefined && field.defaultValue > max) return "Default value must be less than or equal to maximum value.";
  }
  if (typeof field.defaultValue === "string") {
    if (minLength !== undefined && field.defaultValue.length < minLength) return "Default value must meet the minimum length.";
    if (maxLength !== undefined && field.defaultValue.length > maxLength) return "Default value must not exceed the maximum length.";
  }
  return null;
};
type LegacyCondition = Partial<FieldCondition> & { rules?: FieldCondition["groups"][number]["rules"] };

const normalizeCondition = (condition?: LegacyCondition): FieldCondition => {
  const logic = condition?.logic === "or" ? "or" : "and";
  const groups = Array.isArray(condition?.groups)
    ? condition.groups
    : condition?.rules?.length
      ? [{ logic, rules: condition.rules }]
      : [];

  return {
    logic,
    groups: groups.map((group) => ({
      logic: group.logic === "or" ? "or" : "and",
      rules: Array.isArray(group.rules) ? group.rules : [],
    })),
  };
};

const normalizeFormConditions = (form: RequestForm): RequestForm => ({
  ...form,
  fields: form.fields.map((field) => ({ ...field, condition: normalizeCondition(field.condition) })),
  workflowSteps: form.workflowSteps.map((step) => ({ ...step, condition: normalizeCondition(step.condition) })),
});
const nextBuilderId = (prefix: string, existingIds: string[]): string => {
  let sequence = existingIds.length + 1;
  while (existingIds.includes(`${prefix}_${sequence}`)) sequence += 1;
  return `${prefix}_${sequence}`;
};

const conditionOperators: Array<{ value: ConditionOperator; label: string }> = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Does not equal" },
  { value: "contains", label: "Contains" },
  { value: "is_empty", label: "Is empty" },
  { value: "is_not_empty", label: "Is not empty" },
];

function FieldConditionEditor({ field, fieldIndex, fields, onChange }: { field: FormField; fieldIndex: number; fields: FormField[]; onChange(condition: FieldCondition): void }) {
  const condition = field.condition || { logic: "and", groups: [] };
  const availableFields = fields.slice(0, fieldIndex).filter((candidate) => (candidate.stepId || null) === (field.stepId || null));
  const patchGroup = (groupIndex: number, patch: Partial<FieldCondition["groups"][number]>) =>
    onChange({ ...condition, groups: condition.groups.map((group, index) => index === groupIndex ? { ...group, ...patch } : group) });
  const addGroup = () => onChange({ ...condition, groups: [...condition.groups, { logic: "and", rules: [{ fieldId: availableFields[0]?.id || "", operator: "equals", value: "" }] }] });

  return <fieldset className="field-condition-editor">
    <legend>Field condition <span>(optional)</span></legend>
    <p>Show this field only when the nested conditions below match.</p>
    {!!condition.groups.length && <label>Top-level logic<select value={condition.logic} onChange={(event) => onChange({ ...condition, logic: event.target.value as "and" | "or" })}><option value="and">All groups match (AND)</option><option value="or">Any group matches (OR)</option></select></label>}
    {condition.groups.map((group, groupIndex) => <section className="condition-group" key={groupIndex}>
      <header><label>Group {groupIndex + 1} logic<select value={group.logic} onChange={(event) => patchGroup(groupIndex, { logic: event.target.value as "and" | "or" })}><option value="and">All conditions match (AND)</option><option value="or">Any condition matches (OR)</option></select></label><button type="button" className="danger compact" onClick={() => onChange({ ...condition, groups: condition.groups.filter((_, index) => index !== groupIndex) })}>Remove group</button></header>
      {group.rules.map((rule, ruleIndex) => { const source = availableFields.find((candidate) => candidate.id === rule.fieldId); const operators = source?.type === 'csv' ? conditionOperators.filter((operator) => ['is_empty', 'is_not_empty'].includes(operator.value)) : source && !['text', 'textarea', 'email'].includes(source.type) ? conditionOperators.filter((operator) => operator.value !== 'contains') : conditionOperators; return <div className="nested-condition-rule" key={ruleIndex}>
        <label>Field<select value={rule.fieldId} onChange={(event) => patchGroup(groupIndex, { rules: group.rules.map((item, index) => index === ruleIndex ? { ...item, fieldId: event.target.value } : item) })}><option value="">Select an earlier field</option>{availableFields.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.label}</option>)}</select></label>
        <label>Operator<select value={rule.operator} onChange={(event) => patchGroup(groupIndex, { rules: group.rules.map((item, index) => index === ruleIndex ? { ...item, operator: event.target.value as ConditionOperator } : item) })}>{operators.map((operator) => <option value={operator.value} key={operator.value}>{operator.label}</option>)}</select></label>
        {!rule.operator.includes("empty") && <label>Expected value{source?.type === 'checkbox' ? <select value={rule.value} onChange={(event) => patchGroup(groupIndex, { rules: group.rules.map((item, index) => index === ruleIndex ? { ...item, value: event.target.value } : item) })}><option value="">Select a value</option><option value="true">Checked</option><option value="false">Not checked</option></select> : source && ['select', 'radio'].includes(source.type) ? <select value={rule.value} onChange={(event) => patchGroup(groupIndex, { rules: group.rules.map((item, index) => index === ruleIndex ? { ...item, value: event.target.value } : item) })}><option value="">Select an option</option>{source.options.map((option) => <option value={option} key={option}>{option}</option>)}</select> : <input type={source && ['number', 'date', 'time'].includes(source.type) ? source.type : 'text'} min={source?.type === 'number' ? 0 : undefined} value={rule.value} placeholder="Enter the value to compare" onChange={(event) => { if (source?.type === 'number' && event.target.value !== '' && event.target.valueAsNumber < 0) return; patchGroup(groupIndex, { rules: group.rules.map((item, index) => index === ruleIndex ? { ...item, value: event.target.value } : item) }); }}/>}</label>}
        <button type="button" className="danger compact" onClick={() => {
          if (group.rules.length === 1) onChange({ ...condition, groups: condition.groups.filter((_, index) => index !== groupIndex) });
          else patchGroup(groupIndex, { rules: group.rules.filter((_, index) => index !== ruleIndex) });
        }}>Remove condition</button>
      </div>})}
      <button type="button" className="secondary compact" disabled={group.rules.length >= 20} onClick={() => patchGroup(groupIndex, { rules: [...group.rules, { fieldId: availableFields[0]?.id || "", operator: "equals", value: "" }] })}><IconPlus size={15}/>Add condition</button>
    </section>)}
    <button type="button" className="secondary" disabled={!availableFields.length || condition.groups.length >= 20} title={availableFields.length ? "Add a nested condition group" : "Add an earlier field in the same stage first"} onClick={addGroup}><IconPlus size={16}/>Add condition group</button>
  </fieldset>;
}

function StepConditionEditor({ condition, availableFields, onChange }: { condition: FieldCondition; availableFields: FormField[]; onChange(condition: FieldCondition): void }) {
  const patchGroup = (groupIndex: number, patch: Partial<FieldCondition["groups"][number]>) => onChange({ ...condition, groups: condition.groups.map((group, index) => index === groupIndex ? { ...group, ...patch } : group) });
  const addGroup = () => onChange({ ...condition, groups: [...condition.groups, { logic: "and", rules: [{ fieldId: availableFields[0]?.id || "", operator: "equals", value: "" }] }] });
  return <fieldset className="field-condition-editor step-nested-condition"><legend>Step visibility <span>(optional)</span></legend><p>Show this step only when the nested conditions below match.</p>
    {!!condition.groups.length && <label>Top-level logic<select value={condition.logic} onChange={(event) => onChange({ ...condition, logic: event.target.value as "and" | "or" })}><option value="and">All groups match (AND)</option><option value="or">Any group matches (OR)</option></select></label>}
    {condition.groups.map((group, groupIndex) => <section className="condition-group" key={groupIndex}><header><label>Group {groupIndex + 1} logic<select value={group.logic} onChange={(event) => patchGroup(groupIndex, { logic: event.target.value as "and" | "or" })}><option value="and">All conditions match (AND)</option><option value="or">Any condition matches (OR)</option></select></label><button type="button" className="danger compact" onClick={() => onChange({ ...condition, groups: condition.groups.filter((_, index) => index !== groupIndex) })}>Remove group</button></header>
      {group.rules.map((rule, ruleIndex) => { const source = availableFields.find((field) => field.id === rule.fieldId); const operators = source && !['text', 'textarea', 'email'].includes(source.type) ? conditionOperators.filter((operator) => operator.value !== 'contains') : conditionOperators; return <div className="nested-condition-rule" key={ruleIndex}><label>Field<select value={rule.fieldId} onChange={(event) => patchGroup(groupIndex, { rules: group.rules.map((item, index) => index === ruleIndex ? { ...item, fieldId: event.target.value, value: '' } : item) })}><option value="">Select an earlier field</option>{availableFields.map((field) => <option value={field.id} key={field.id}>{field.label}</option>)}</select></label><label>Operator<select value={rule.operator} onChange={(event) => patchGroup(groupIndex, { rules: group.rules.map((item, index) => index === ruleIndex ? { ...item, operator: event.target.value as ConditionOperator } : item) })}>{operators.map((operator) => <option value={operator.value} key={operator.value}>{operator.label}</option>)}</select></label>{!rule.operator.includes('empty') && <label>Expected value{source && ['select', 'radio'].includes(source.type) ? <select value={rule.value} onChange={(event) => patchGroup(groupIndex, { rules: group.rules.map((item, index) => index === ruleIndex ? { ...item, value: event.target.value } : item) })}><option value="">Select an option</option>{source.options.map((option) => <option key={option}>{option}</option>)}</select> : <input type={source && ['number', 'date', 'time'].includes(source.type) ? source.type : 'text'} min={source?.type === 'number' ? 0 : undefined} value={rule.value} onChange={(event) => patchGroup(groupIndex, { rules: group.rules.map((item, index) => index === ruleIndex ? { ...item, value: event.target.value } : item) })}/>}</label>}<button type="button" className="danger compact" onClick={() => group.rules.length === 1 ? onChange({ ...condition, groups: condition.groups.filter((_, index) => index !== groupIndex) }) : patchGroup(groupIndex, { rules: group.rules.filter((_, index) => index !== ruleIndex) })}>Remove</button></div>; })}
      <button type="button" className="secondary compact" onClick={() => patchGroup(groupIndex, { rules: [...group.rules, { fieldId: availableFields[0]?.id || '', operator: 'equals', value: '' }] })}><IconPlus size={15}/>Add condition</button></section>)}
    <button type="button" className="secondary" disabled={!availableFields.length} onClick={addGroup}><IconPlus size={16}/>Add condition group</button>
  </fieldset>;
}

function InlineFieldEditor({ field, index, fields, workflowSteps, onPatch, onValidationPatch }: { field: FormField; index: number; fields: FormField[]; workflowSteps: Draft["workflowSteps"]; onPatch(patch: Partial<FormField>): void; onValidationPatch(patch: Partial<FormField["validation"]>): void }) {
  const numericChange = (key: "min" | "max", raw: string, value: number) => {
    if (raw === "") { onValidationPatch({ [key]: undefined }); return; }
    if (!Number.isFinite(value) || value < 0) return;
    onValidationPatch({ [key]: value });
  };
  const validationIssue = fieldValidationIssue(field);
  return <div className="inline-field-editor" onClick={(event) => event.stopPropagation()}>
    <div className="field-settings-grid">
      <label>Field label<input value={field.label} onChange={(event) => onPatch({ label: event.target.value, id: (slug(event.target.value).replaceAll("-", "_") || `field_${index + 1}`).slice(0, 50) })}/></label>
      <label>Field type<select value={field.type} onChange={(event) => { const type = event.target.value as FieldType; onPatch({ type, defaultValue: null, ...(type === 'csv' ? { stepId: null } : {}) }); }}>{fieldTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label>Completed by<select disabled={field.type === 'csv'} value={field.stepId || ""} onChange={(event) => onPatch({ stepId: event.target.value || null, condition: { logic: "and", groups: [] } })}><option value="">Requester submission</option>{workflowSteps.map((step) => <option value={step.id} key={step.id}>{step.name}</option>)}</select></label>
    </div>
    <label className="field-help">Help text or instructions<textarea value={field.description} placeholder="Explain what information should be entered in this field." onChange={(event) => onPatch({ description: event.target.value })}/></label>
    {['select', 'radio'].includes(field.type) && <label>Options<textarea className="options" value={field.options.join("\n")} placeholder="One option per line, or separate options with commas" onChange={(event) => onPatch({ options: event.target.value.split(/[\n,]/).map((value) => value.trim()).filter(Boolean), defaultValue: null })}/></label>}
    <div className="field-defaults-grid">
      {field.type === 'csv' ? <div className="field-type-note"><strong>CSV upload</strong><small>Accepts one CSV file up to 10 MB. The uploaded file remains available from the submitted request.</small></div> : field.type === 'checkbox' ? <label className="check"><input type="checkbox" checked={field.defaultValue === true} onChange={(event) => onPatch({ defaultValue: event.target.checked })}/>Checked by default</label> : <label>Default value{['select', 'radio'].includes(field.type) ? <select value={String(field.defaultValue ?? "")} onChange={(event) => onPatch({ defaultValue: event.target.value || null })}><option value="">No default value</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : <input type={['number', 'date', 'time'].includes(field.type) ? field.type : 'text'} min={field.type === 'number' ? 0 : undefined} value={String(field.defaultValue ?? "")} onChange={(event) => { if (field.type === 'number' && event.target.value !== '') { const value = event.target.valueAsNumber; if (!Number.isFinite(value) || value < 0 || (field.validation.min !== undefined && value < field.validation.min) || (field.validation.max !== undefined && value > field.validation.max)) return; onPatch({ defaultValue: value }); } else onPatch({ defaultValue: event.target.value || null }); }}/>}</label>}
      {!['checkbox', 'radio', 'select', 'csv'].includes(field.type) && <label>Placeholder<input maxLength={300} value={field.placeholder || ""} placeholder="Text shown before the user enters a value" onChange={(event) => onPatch({ placeholder: event.target.value })}/></label>}
    </div>
    {['text', 'textarea', 'email'].includes(field.type) && <fieldset className="validation-editor"><legend>Validation rules</legend><label>Minimum length<input type="number" min="0" max="10000" value={field.validation.minLength ?? ""} onChange={(event) => onValidationPatch({ minLength: event.target.value === '' ? undefined : Math.max(0, event.target.valueAsNumber) })}/></label><label>Maximum length<input type="number" min="1" max="10000" value={field.validation.maxLength ?? ""} onChange={(event) => { const value = event.target.valueAsNumber; if (event.target.value !== '' && (!Number.isFinite(value) || value < 1)) return; onValidationPatch({ maxLength: event.target.value === '' ? undefined : value }); }}/></label><label className="validation-pattern">Pattern (regular expression)<input maxLength={300} value={field.validation.pattern ?? ""} placeholder="Example: ^ABC-[0-9]{4}$" onChange={(event) => onValidationPatch({ pattern: event.target.value || undefined })}/></label><label>Pattern flags<select disabled={!field.validation.pattern} value={field.validation.patternFlags ?? ""} onChange={(event) => onValidationPatch({ patternFlags: event.target.value || undefined })}><option value="">Case-sensitive</option><option value="i">Ignore case</option><option value="m">Multiline</option><option value="im">Ignore case + multiline</option></select></label><label className="validation-message">Error message<input maxLength={300} value={field.validation.message ?? ""} onChange={(event) => onValidationPatch({ message: event.target.value || undefined })}/></label>{validationIssue && <small className="field-error validation-help" role="alert">{validationIssue}</small>}</fieldset>}
    {field.type === 'number' && <fieldset className="validation-editor numeric-validation"><legend>Validation rules</legend><label>Minimum value<input type="number" min="0" aria-invalid={Boolean(validationIssue)} value={field.validation.min ?? ""} onChange={(event) => numericChange('min', event.target.value, event.target.valueAsNumber)}/></label><label>Maximum value<input type="number" min="0" aria-invalid={Boolean(validationIssue)} value={field.validation.max ?? ""} onChange={(event) => numericChange('max', event.target.value, event.target.valueAsNumber)}/></label><small className="validation-help">Only non-negative numbers are accepted. Maximum must be greater than or equal to minimum.</small>{validationIssue && <small className="field-error validation-help" role="alert">{validationIssue}</small>}</fieldset>}
    <label className="check"><input type="checkbox" checked={field.required} onChange={(event) => onPatch({ required: event.target.checked })}/>Required</label>
    <FieldConditionEditor field={field} fieldIndex={index} fields={fields} onChange={(condition) => onPatch({ condition })}/>
  </div>;
}

const previewStepApplies = (step: Draft["workflowSteps"][number], responses: Record<string, unknown>): boolean => {
  const groups = step.condition?.groups || [];
  if (!groups.length) return true;
  const ruleMatches = (rule: FieldCondition["groups"][number]["rules"][number]) => {
    const value = responses[rule.fieldId];
    const text = value === undefined || value === null ? "" : String(value);
    if (rule.operator === "equals") return text === rule.value;
    if (rule.operator === "not_equals") return text !== rule.value;
    if (rule.operator === "contains") return text.includes(rule.value);
    if (rule.operator === "is_empty") return text === "" || value === false;
    return text !== "" && value !== false;
  };
  const matches = groups.map((group) => { const results = group.rules.map(ruleMatches); return group.logic === 'or' ? results.some(Boolean) : results.every(Boolean); });
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
        <textarea value={String(value || "")} placeholder={field.placeholder || field.description} onChange={(event) => onChange(event.target.value)} />
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
  if (field.type === "csv")
    return (
      <label className="field-wide">
        <span>{label}</span>
        {description}
        <input type="file" accept=".csv,text/csv,application/csv" onChange={(event) => onChange(event.target.files?.[0]?.name || "")} />
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
        min={field.type === "number" ? field.validation.min ?? 0 : undefined}
        max={field.type === "number" ? field.validation.max : undefined}
        value={field.type === "image" || field.type === "pdf" ? undefined : String(value || "")}
        placeholder={field.placeholder || field.description}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function FormBuilder() {
  const [forms, setForms] = useState<RequestForm[]>([]);
  const [groups, setGroups] = useState<FormGroup[]>([]);
  const [roles, setRoles] = useState<Array<{ value: Role; label: string }>>([]);
  const [draft, setDraft] = useState<Draft>(blank());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewResponses, setPreviewResponses] = useState<Record<string, unknown>>({});
  const [previewStage, setPreviewStage] = useState(0);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);
  const [expandedFieldIndex, setExpandedFieldIndex] = useState<number | null>(null);
  const [draggedFieldIndex, setDraggedFieldIndex] = useState<number | null>(null);
  const [deleteFieldTarget, setDeleteFieldTarget] = useState<{ index: number; label: string } | null>(null);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [builderTab, setBuilderTab] = useState<"fields" | "steps">("fields");
  const [duplicateTarget, setDuplicateTarget] = useState<{ kind: "field" | "step"; index: number } | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [draftStatus, setDraftStatus] = useState("");
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupSaving, setGroupSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta>(initialMeta);
  const draftReady = useRef(false);
  const addFieldButtonRef = useRef<HTMLButtonElement>(null);
  const addStepButtonRef = useRef<HTMLButtonElement>(null);
  const [topBuilderActionVisible, setTopBuilderActionVisible] = useState(true);
  const load = useCallback(async () => {
    try {
      const [formResult, roleResult, groupResult] = await Promise.all([
        api.get<{ data: RequestForm[]; meta: PaginationMeta }>(`/forms?page=${page}&pageSize=100`),
        api.get<{ data: RoleOption[] }>("/roles"),
        api.get<{ data: FormGroup[] }>("/form-groups"),
      ]);
      setForms(formResult.data.map(normalizeFormConditions));
      setMeta(formResult.meta);
      setRoles(roleResult.data.map((role) => ({ value: role.role, label: role.label })));
      setGroups(groupResult.data);
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
            setDraft(normalizeFormConditions(parsed as RequestForm));
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
  useEffect(() => {
    const target = builderTab === "fields" ? addFieldButtonRef.current : addStepButtonRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setTopBuilderActionVisible(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [builderTab]);
  const generatedKey = useMemo(
    () => ("id" in draft ? draft.key : slug(draft.name)),
    [draft],
  );
  const previewSteps = useMemo(
    () => draft.workflowSteps.filter((step) => previewStepApplies(step, previewResponses)),
    [draft.workflowSteps, previewResponses],
  );
  const activePreviewStage = Math.min(previewStage, previewSteps.length);
  const currentPreviewStep = activePreviewStage === 0 ? null : previewSteps[activePreviewStage - 1] || null;
  const previewFields = draft.fields.filter((field) =>
    (currentPreviewStep ? field.stepId === currentPreviewStep.id : !field.stepId) && fieldIsVisible(field, previewResponses),
  );
  const previewRoleLabel = (role: Role) => roles.find((candidate) => candidate.value === role)?.label || role.replaceAll("_", " ");
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
          defaultValue: null,
          placeholder: "",
          options: [],
          stepId: null,
          condition: { logic: "and", groups: [] },
          validation: {},
        },
      ],
    }));
    setExpandedFieldIndex(nextIndex);
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
          approvalMode: "sequential",
          approvalRule: "all",
          condition: { logic: "and", groups: [] },
        },
      ],
    }));
    setEditingStepIndex(nextIndex);
    setBuilderTab("steps");
  };
  const reorderFields = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const fields = [...draft.fields];
    const [moved] = fields.splice(fromIndex, 1);
    fields.splice(toIndex, 0, moved);
    const positions = new Map(fields.map((field, index) => [field.id, index]));
    const invalid = fields.some((field, index) => (field.condition?.groups || []).some((group) => group.rules.some((rule) => (positions.get(rule.fieldId) ?? index) >= index)));
    if (invalid) { setError('A field cannot be moved before a field used by its visibility conditions.'); return; }
    setDraft((current) => ({ ...current, fields }));
    setExpandedFieldIndex(toIndex);
  };
  const confirmDeleteField = () => {
    if (!deleteFieldTarget) return;
    setDraft((current) => {
      const removedId = current.fields[deleteFieldTarget.index]?.id;
      if (!removedId) return current;
      const fields = current.fields
        .filter((_, index) => index !== deleteFieldTarget.index)
        .map((field) => ({ ...field, condition: { ...field.condition, groups: (field.condition?.groups || []).map((group) => ({ ...group, rules: group.rules.filter((rule) => rule.fieldId !== removedId) })).filter((group) => group.rules.length) } }));
      const workflowSteps = current.workflowSteps.map((step) => ({ ...step, condition: { ...step.condition, groups: (step.condition?.groups || []).map((group) => ({ ...group, rules: group.rules.filter((rule) => rule.fieldId !== removedId) })).filter((group) => group.rules.length) } }));
      return { ...current, fields, workflowSteps };
    });
    setExpandedFieldIndex(null);
    setDeleteFieldTarget(null);
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
          condition: { ...source.condition, groups: (source.condition?.groups || []).map((group) => ({ ...group, rules: group.rules.map((rule) => ({ ...rule })) })) },
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
          condition: { ...field.condition, groups: (field.condition?.groups || []).map((group) => ({ ...group, rules: group.rules.map((rule) => ({ ...rule })) })) },
        }));
        return {
          ...sourceStep,
          id: stepId,
          name: `${sourceStep.name} (Copy ${copyIndex + 1})`,
          allowedRoles: [...sourceStep.allowedRoles],
          condition: { ...sourceStep.condition, groups: (sourceStep.condition?.groups || []).map((group) => ({ ...group, rules: group.rules.map((rule) => ({ ...rule })) })) },
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
    const invalidFieldIndex = draft.fields.findIndex((field) => fieldValidationIssue(field));
    if (invalidFieldIndex >= 0) {
      const invalidField = draft.fields[invalidFieldIndex];
      setBuilderTab("fields");
      setExpandedFieldIndex(invalidFieldIndex);
      setError(`${invalidField.label || `Field ${invalidFieldIndex + 1}`}: ${fieldValidationIssue(invalidField)}`);
      return;
    }
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
  const resetGroupEditor = () => {
    setEditingGroupId(null);
    setGroupName("");
  };
  const saveGroup = async (event: FormEvent) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) return;
    setGroupSaving(true);
    setError("");
    try {
      const result = editingGroupId
        ? await api.patch<{ data: FormGroup }>(`/form-groups/${editingGroupId}`, { name })
        : await api.post<{ data: FormGroup }>("/form-groups", { name });
      if (!draft.groupId || draft.groupId === result.data.id) {
        setDraft((current) => ({ ...current, groupId: result.data.id, groupName: result.data.name }));
      }
      resetGroupEditor();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save form group");
    } finally {
      setGroupSaving(false);
    }
  };
  const deleteGroup = async (group: FormGroup) => {
    if (!window.confirm(`Delete the group “${group.name}”?`)) return;
    setGroupSaving(true);
    setError("");
    try {
      await api.delete(`/form-groups/${group.id}`);
      if (draft.groupId === group.id) setDraft({ ...draft, groupId: "", groupName: "" });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete form group");
    } finally {
      setGroupSaving(false);
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
              <button type="button" className="secondary" onClick={() => setGroupsOpen(true)}>
                Manage groups
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setPreview((value) => {
                  if (!value) { setPreviewResponses(initialFieldResponses(draft.fields)); setPreviewStage(0); }
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
                  <button type="button" className={activePreviewStage === 0 ? "active" : ""} onClick={() => setPreviewStage(0)}>
                    <span>1</span><strong>Request details</strong><small>Requester</small>
                  </button>
                  {previewSteps.map((step, index) => {
                    const stepRoles = step.allowedRoles?.length ? step.allowedRoles : [step.approverRole];
                    return <button type="button" className={activePreviewStage === index + 1 ? "active" : ""} onClick={() => setPreviewStage(index + 1)} key={step.id}>
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
                  <button type="button" className="secondary" disabled={activePreviewStage === 0} onClick={() => setPreviewStage(Math.max(0, activePreviewStage - 1))}>Previous step</button>
                  <button type="button" className="primary" disabled={activePreviewStage >= previewSteps.length} onClick={() => setPreviewStage(Math.min(previewSteps.length, activePreviewStage + 1))}>Next step</button>
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
                    Group
                    <select
                      required
                      value={draft.groupId || ""}
                      onChange={(event) => {
                        const group = groups.find((item) => item.id === event.target.value);
                        setDraft({ ...draft, groupId: group?.id || "", groupName: group?.name || "" });
                      }}
                    >
                      <option value="">Select a group</option>
                      {groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}
                    </select>
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
                <div className="builder-workspace">
                  <aside className="builder-step-rail" aria-label="Workflow steps"><header><strong>Steps ({draft.workflowSteps.length})</strong><button type="button" className="primary compact" onClick={addStep}><IconPlus size={14}/>Add</button></header><button type="button" className={!draft.workflowSteps.length ? "active" : ""} onClick={() => setBuilderTab("fields")}><span>0</span><span><strong>Request details</strong><small>{draft.fields.filter((field) => !field.stepId).length} fields</small></span></button>{draft.workflowSteps.map((step, index) => <button type="button" key={step.id} className={editingStepIndex === index ? "active" : ""} onClick={() => { setBuilderTab("steps"); setEditingStepIndex(index); }}><span>{index + 1}</span><span><strong>{step.name || `Step ${index + 1}`}</strong><small>{draft.fields.filter((field) => field.stepId === step.id).length} fields{step.condition?.groups?.length ? " · Conditional" : ""}</small></span></button>)}</aside>
                  <section className="builder-workspace-main">
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
                  <button ref={addFieldButtonRef} type="button" className="primary compact" onClick={addField}><IconPlus size={15}/>Add field</button>
                </div>
                <div className="builder-accordion">
                  {draft.fields.map((field, index) => {
                    const stepName = field.stepId ? draft.workflowSteps.find((step) => step.id === field.stepId)?.name || "Unknown step" : "Requester submission";
                    return <details key={field.id || index} open={expandedFieldIndex === index} onToggle={(event) => { if (event.currentTarget.open) setExpandedFieldIndex(index); else if (expandedFieldIndex === index) setExpandedFieldIndex(null); }} onDragOver={(event) => { if (draggedFieldIndex !== null) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (draggedFieldIndex !== null) reorderFields(draggedFieldIndex, index); setDraggedFieldIndex(null); }}>
                      <summary draggable onDragStart={(event) => { setDraggedFieldIndex(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', field.id); }} onDragEnd={() => setDraggedFieldIndex(null)}>
                        <IconGripVertical className="field-drag-handle" size={19} aria-label="Drag to reorder field"/>
                        <span className="builder-item-number">{index + 1}</span>
                        <span className="builder-item-title"><strong>{field.label || `Field ${index + 1}`}</strong><small><span className="builder-badge">{field.type}</span><span>{stepName}</span>{field.required && <span className="builder-badge required">Required</span>}{Boolean(field.condition?.groups?.length) && <span className="builder-badge conditional">Conditional</span>}</small></span>
                        <span className="builder-item-actions"><button type="button" className="secondary compact" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setDuplicateTarget({ kind: "field", index }); setDuplicateCount(1); }}>Duplicate</button><button type="button" className="danger compact" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setDeleteFieldTarget({ index, label: field.label || `Field ${index + 1}` }); }}><IconTrash size={15}/>Delete</button></span>
                      </summary>
                      <InlineFieldEditor field={field} index={index} fields={draft.fields} workflowSteps={draft.workflowSteps} onPatch={(patch) => patchField(index, patch)} onValidationPatch={(patch) => patchFieldValidation(index, patch)}/>
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
                          <select value={field.stepId || ""} onChange={(event) => patchField(index,{ stepId:event.target.value||null, condition: { logic: "and", groups: [] } })}>
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
                      <div className="field-defaults-grid">
                        {field.type === "csv" ? <div className="field-type-note"><strong>CSV upload</strong><small>Accepts one CSV file up to 10 MB.</small></div> : field.type === "checkbox" ? <label className="check"><input type="checkbox" checked={field.defaultValue === true} onChange={(event) => patchField(index, { defaultValue: event.target.checked })}/>Checked by default</label> : <label>
                          Default value
                          {field.type === "select" || field.type === "radio" ? <select value={String(field.defaultValue ?? "")} onChange={(event) => patchField(index, { defaultValue: event.target.value || null })}><option value="">No default value</option>{field.options.map((option) => <option value={option} key={option}>{option}</option>)}</select> : <input type={field.type === "number" || field.type === "date" || field.type === "time" ? field.type : "text"} min={field.type === "number" ? 0 : undefined} value={String(field.defaultValue ?? "")} onChange={(event) => { if (field.type === "number" && event.target.value !== "") { const value = event.target.valueAsNumber; if (!Number.isFinite(value) || value < 0 || (field.validation.min !== undefined && value < field.validation.min) || (field.validation.max !== undefined && value > field.validation.max)) return; patchField(index, { defaultValue: value }); return; } patchField(index, { defaultValue: event.target.value || null }); }}/>} 
                        </label>}
                        {!['checkbox', 'radio', 'select', 'csv'].includes(field.type) && <label>
                          Placeholder
                          <input maxLength={300} value={field.placeholder || ""} placeholder="Text shown before the user enters a value" onChange={(event) => patchField(index, { placeholder: event.target.value })}/>
                        </label>}
                      </div>
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
                              aria-invalid={Boolean(fieldValidationIssue(field))}
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
                              aria-invalid={Boolean(fieldValidationIssue(field))}
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
                          {fieldValidationIssue(field) && <small className="field-error validation-help" role="alert">{fieldValidationIssue(field)}</small>}
                        </fieldset>
                      )}
                      {field.type === "number" && (
                        <fieldset className="validation-editor numeric-validation">
                          <legend>Validation rules</legend>
                          <label>
                            Minimum value
                            <input
                              type="number"
                              min="0"
                              aria-invalid={Boolean(fieldValidationIssue(field))}
                              value={field.validation.min ?? ""}
                              onChange={(event) => { const value = event.target.valueAsNumber; if (event.target.value !== "" && (!Number.isFinite(value) || value < 0)) return; patchFieldValidation(index, { min: event.target.value === "" ? undefined : value }); }}
                            />
                          </label>
                          <label>
                            Maximum value
                            <input
                              type="number"
                              min="0"
                              aria-invalid={Boolean(fieldValidationIssue(field))}
                              value={field.validation.max ?? ""}
                              onChange={(event) => { const value = event.target.valueAsNumber; if (event.target.value !== "" && (!Number.isFinite(value) || value < 0)) return; patchFieldValidation(index, { max: event.target.value === "" ? undefined : value }); }}
                            />
                          </label>
                          <small className="validation-help">Only non-negative numbers are accepted. Maximum must be greater than or equal to minimum.</small>
                          {fieldValidationIssue(field) && <small className="field-error validation-help" role="alert">{fieldValidationIssue(field)}</small>}
                        </fieldset>
                      )}
                      <FieldConditionEditor field={field} fieldIndex={index} fields={draft.fields} onChange={(condition) => patchField(index, { condition })}/>
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
                    <p>Steps run in order. Each step may require one or multiple approver roles.</p>
                  </div>
                  <button ref={addStepButtonRef} type="button" className="primary compact" onClick={addStep}><IconPlus size={15}/>Add step</button>
                </div>
                <div className="builder-accordion workflow-accordion">
                  {draft.workflowSteps.map((step, index) => {
                    const stepRoles = step.allowedRoles?.length ? step.allowedRoles : [step.approverRole];
                    return <details key={step.id}>
                      <summary>
                        <span className="builder-item-number">{index + 1}</span>
                        <span className="builder-item-title"><strong>{step.name || `Step ${index + 1}`}</strong><small><span className="builder-badge">Step {index + 1}</span><span>{stepRoles.map(previewRoleLabel).join(", ")}</span><span className="builder-badge">{step.approvalMode === "parallel" ? `Parallel · ${step.approvalRule === "any" ? "any" : "all"}` : "Sequential"}</span>{Boolean(step.condition?.groups?.length) && <span className="builder-badge conditional">Conditional</span>}</small></span>
                        <span className="builder-item-actions"><button type="button" className="secondary compact" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setDuplicateTarget({ kind: "step", index }); setDuplicateCount(1); }}>Duplicate</button><button type="button" className="secondary compact" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setEditingStepIndex(index); }}>Edit</button></span>
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
                        <label>Approval mode<select value={step.approvalMode || "sequential"} onChange={(event)=>patchStep(index,{approvalMode:event.target.value as "sequential"|"parallel"})}><option value="sequential">One eligible approver</option><option value="parallel">Multiple approver roles</option></select></label>
                        {(step.approvalMode || "sequential") === "parallel" && <label>Completion rule<select value={step.approvalRule || "all"} onChange={(event)=>patchStep(index,{approvalRule:event.target.value as "any"|"all"})}><option value="all">All selected roles must approve</option><option value="any">Any selected role may approve</option></select></label>}
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
                      <StepConditionEditor condition={step.condition || { logic: "and", groups: [] }} availableFields={draft.fields.filter((field)=>!field.stepId||draft.workflowSteps.findIndex((candidate)=>candidate.id===field.stepId)<index)} onChange={(condition) => patchStep(index, { condition })}/>
                    </article>
                  ))}
                    </div></div>
                    <footer className="builder-modal-footer"><button type="button" className="primary" onClick={() => setEditingStepIndex(null)}>Done</button></footer>
                  </section>
                </div>}
                </>}
                  </section>
                  <aside className="builder-preview-rail"><header><strong>Live preview</strong></header><p>Test field visibility and workflow steps with editable answers. Preview data is never saved.</p><div><span>{draft.fields.length}</span><small>Fields</small><span>{draft.workflowSteps.length}</span><small>Steps</small></div><button type="button" className="secondary" onClick={() => { setPreviewResponses(initialFieldResponses(draft.fields)); setPreviewStage(0); setPreview(true); }}><IconEye size={16}/>Open preview</button></aside>
                </div>
                {!topBuilderActionVisible && <div className="builder-floating-actions" aria-label="Builder actions">
                  {builderTab === "fields" ? <button type="button" onClick={addField}><IconPlus size={18}/><span>Add field</span></button> : <button type="button" onClick={addStep}><IconPlus size={18}/><span>Add step</span></button>}
                </div>}
                {deleteFieldTarget && <div className="modal-backdrop builder-editor-backdrop" onMouseDown={() => setDeleteFieldTarget(null)}>
                  <section className="modal builder-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-field-title" aria-describedby="delete-field-description" onMouseDown={(event) => event.stopPropagation()}>
                    <div className="confirm-modal-icon"><IconTrash size={22}/></div>
                    <p className="eyebrow">Delete form field</p>
                    <h2 id="delete-field-title">Delete “{deleteFieldTarget.label}”?</h2>
                    <p id="delete-field-description">This removes the field and any visibility or workflow conditions that depend on it. This change is applied when you save the form.</p>
                    <div className="modal-actions"><button type="button" className="secondary" onClick={() => setDeleteFieldTarget(null)}>Keep field</button><button type="button" className="danger confirm-delete" onClick={confirmDeleteField}><IconTrash size={16}/>Delete field</button></div>
                  </section>
                </div>}
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
      {groupsOpen && <div className="modal-backdrop builder-editor-backdrop" onMouseDown={() => { setGroupsOpen(false); resetGroupEditor(); }}>
        <section className="modal form-groups-modal" role="dialog" aria-modal="true" aria-labelledby="form-groups-title" onMouseDown={(event) => event.stopPropagation()}>
          <header className="builder-modal-heading">
            <div><p className="eyebrow">Form configuration</p><h2 id="form-groups-title">Manage groups</h2><p>Create reusable groups for organizing request forms.</p></div>
            <button type="button" aria-label="Close group manager" onClick={() => { setGroupsOpen(false); resetGroupEditor(); }}><IconX size={20}/></button>
          </header>
          <form className="form-group-create" onSubmit={saveGroup}>
            <label><span>{editingGroupId ? "Group name" : "New group name"}</span><input maxLength={100} required value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="e.g. Information Technology" /></label>
            <div>{editingGroupId && <button type="button" className="secondary" onClick={resetGroupEditor}>Cancel</button>}<button type="submit" className="primary" disabled={groupSaving}>{groupSaving ? "Saving…" : editingGroupId ? "Save changes" : "Add group"}</button></div>
          </form>
          <div className="form-group-list">
            {groups.map((group) => <article key={group.id}>
              <div><strong>{group.name}</strong><small>{group.formCount} {group.formCount === 1 ? "form" : "forms"}</small></div>
              <div>
                <button type="button" className="secondary compact" disabled={groupSaving} onClick={() => { setEditingGroupId(group.id); setGroupName(group.name); }}><IconPencil size={16}/>Edit</button>
                <button type="button" className="danger compact" disabled={groupSaving || group.formCount > 0} title={group.formCount > 0 ? "Move its forms before deleting this group" : "Delete group"} onClick={() => void deleteGroup(group)}><IconTrash size={16}/>Delete</button>
              </div>
            </article>)}
            {!groups.length && <div className="builder-empty-list">No groups yet. Add the first group above.</div>}
          </div>
        </section>
      </div>}
    </>
  );
}
