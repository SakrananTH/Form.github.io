import { projectId, publicAnonKey } from '/utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-96237c51`;
const REST_BASE = `https://${projectId}.supabase.co/rest/v1`;

async function restRequest(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${REST_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': publicAnonKey,
      'Authorization': `Bearer ${publicAnonKey}`,
      'Prefer': 'return=representation',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Request failed');
    throw new Error(errorText || 'Request failed');
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function deleteKvStoreEntries(formId: string) {
  try {
    await restRequest('/rpc/delete_form_history', {
      method: 'POST',
      body: JSON.stringify({ target_form_id: formId }),
    });
    return;
  } catch {
    // Fall back to direct table deletes when the RPC is unavailable.
  }

  const responseParams = new URLSearchParams();
  responseParams.set('key', `like.response:${formId}:*`);

  await restRequest(`/kv_store_96237c51?${responseParams.toString()}`, {
    method: 'DELETE',
  });

  const formParams = new URLSearchParams();
  formParams.set('key', `eq.form:${formId}`);

  await restRequest(`/kv_store_96237c51?${formParams.toString()}`, {
    method: 'DELETE',
  });
}

async function getKvDeleteVerification(formId: string) {
  let formExists = false;
  let responseCount = 0;

  try {
    await apiRequest(`/forms/${formId}`);
    formExists = true;
  } catch {
    formExists = false;
  }

  if (formExists) {
    try {
      const responseResult = await apiRequest(`/forms/${formId}/responses`) as { responses?: Array<unknown> };
      responseCount = Array.isArray(responseResult.responses) ? responseResult.responses.length : 0;
    } catch {
      responseCount = 0;
    }
  }

  return { formExists, responseCount };
}

async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

export interface Question {
  id: string;
  text: string;
  type: 'text' | 'textarea' | 'number' | 'radio' | 'checkbox' | 'select' | 'emoji-scale' | 'icon-scale';
  options?: string[];
  placeholder?: string;
  required?: boolean;
  imageUrl?: string;
  imageName?: string;
}

export interface Form {
  id: string;
  title: string;
  questions: Question[];
  createdAt: string;
}

export interface FormResponse {
  id: string;
  formId: string;
  answers: Record<string, any>;
  respondentName: string;
  submittedAt: string;
}

export const api = {
  async createForm(title: string, questions: Question[]) {
    return apiRequest('/forms', {
      method: 'POST',
      body: JSON.stringify({ title, questions }),
    });
  },

  async getForm(formId: string): Promise<{ form: Form }> {
    return apiRequest(`/forms/${formId}`);
  },

  async submitResponse(formId: string, answers: Record<string, any>, respondentName: string) {
    return apiRequest(`/forms/${formId}/responses`, {
      method: 'POST',
      body: JSON.stringify({ answers, respondentName }),
    });
  },

  async getResponses(formId: string): Promise<{ responses: FormResponse[] }> {
    return apiRequest(`/forms/${formId}/responses`);
  },

  async getAllForms(): Promise<{ forms: Form[] }> {
    return apiRequest('/forms');
  },

  async deleteForm(formId: string): Promise<{ success: boolean }> {
    try {
      return await apiRequest(`/forms/${formId}`, {
        method: 'DELETE',
      });
    } catch (deleteError) {
      await deleteKvStoreEntries(formId);

      const verification = await getKvDeleteVerification(formId);
      if (verification.formExists || verification.responseCount > 0) {
        const deleteMessage = deleteError instanceof Error ? deleteError.message : '';

        if (/request failed|not found/i.test(deleteMessage)) {
          throw new Error('Live delete endpoint is not available and direct Supabase delete could not be confirmed');
        }

        throw new Error('Live delete is blocked by current Supabase permissions');
      }

      return { success: true };
    }
  },
};
