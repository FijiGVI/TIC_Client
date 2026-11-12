import type { ConditionRule, FormField } from "@/lib/types";

function ruleMatches(rule: ConditionRule, responses: Record<string, unknown>): boolean {
  const value = responses[rule.fieldId];
  const text = value === undefined || value === null ? "" : String(value);
  if (rule.operator === "equals") return text === rule.value;
  if (rule.operator === "not_equals") return text !== rule.value;
  if (rule.operator === "contains") return text.includes(rule.value);
  if (rule.operator === "is_empty") return text === "" || value === false;
  return text !== "" && value !== false;
}

export function fieldIsVisible(field: FormField, responses: Record<string, unknown>): boolean {
  if (!field.condition?.groups?.length) return true;
  const groupResults = field.condition.groups.map((group) => {
    const results = group.rules.map((rule) => ruleMatches(rule, responses));
    return group.logic === "or" ? results.some(Boolean) : results.every(Boolean);
  });
  return field.condition.logic === "or" ? groupResults.some(Boolean) : groupResults.every(Boolean);
}

export function fieldInitialValue(field: FormField): unknown {
  if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== "") return field.defaultValue;
  return field.type === "checkbox" ? false : "";
}

export function initialFieldResponses(fields: FormField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field.id, fieldInitialValue(field)]));
}
