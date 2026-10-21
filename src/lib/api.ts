// Authenticated request helper for the Railway API
import { requireApiEnvironment } from '@/config/env';
import { supabase } from '@/lib/supabase';

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: `/${string}`, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(`${requireApiEnvironment()}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
      signal: controller.signal,
    });
    const body = (await response.json()) as T & ApiErrorBody;
    if (!response.ok) {
      throw new ApiError(
        body.error?.message ?? 'The server request failed.',
        response.status,
        body.error?.code ?? 'request_failed',
      );
    }
    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}
