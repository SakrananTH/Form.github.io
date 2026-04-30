const RESULTS_ACCESS_STORAGE_KEY = 'exercise-form-results-access';

function readAuthorizedFormIds() {
  if (typeof window === 'undefined') {
    return [] as string[];
  }

  try {
    const rawValue = window.localStorage.getItem(RESULTS_ACCESS_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    return Array.isArray(parsedValue) ? parsedValue.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [] as string[];
  }
}

function writeAuthorizedFormIds(formIds: string[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(RESULTS_ACCESS_STORAGE_KEY, JSON.stringify([...new Set(formIds)]));
}

export function grantResultsAccess(formId: string) {
  if (!formId) {
    return;
  }

  writeAuthorizedFormIds([...readAuthorizedFormIds(), formId]);
}

export function hasResultsAccess(formId?: string) {
  if (!formId) {
    return false;
  }

  return readAuthorizedFormIds().includes(formId);
}

export function revokeResultsAccess(formId: string) {
  if (!formId) {
    return;
  }

  writeAuthorizedFormIds(readAuthorizedFormIds().filter((value) => value !== formId));
}