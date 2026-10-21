// Supabase access for the AI endpoints: reads entries and stores AI results for a user
function bearerHeaders(authorization, publishableKey, prefer) {
  return {
    apikey: publishableKey,
    authorization,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
  };
}

export function createSupabaseAiStore({ fetchImpl = fetch, supabasePublishableKey, supabaseUrl }) {
  async function request(path, authorization, init = {}) {
    const response = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        ...bearerHeaders(authorization, supabasePublishableKey, init.prefer),
        ...init.headers,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404 && init.missingOk) return undefined;
    if (!response.ok) throw new Error(`Supabase AI store failed with ${response.status}.`);
    if (response.status === 204) return null;
    return response.json();
  }

  function query(table, parameters) {
    return `${table}?${new URLSearchParams(parameters).toString()}`;
  }

  return {
    // Records one AI use for today in the database (migration `20260928204804_ai_usage_limit.sql`). Returns
    // whether it is allowed, or null when that migration has not been applied yet.
    async takeAiQuota({ authorization, limit }) {
      const allowed = await request('rpc/take_ai_quota', authorization, {
        body: JSON.stringify({ daily_limit: limit }),
        method: 'POST',
        missingOk: true,
      });
      return typeof allowed === 'boolean' ? allowed : null;
    },
    async getDailyPrompt({ authorization, localDate, userId }) {
      const rows = await request(
        query('daily_prompts', {
          limit: '1',
          local_date: `eq.${localDate}`,
          select: 'prompt_text,estimated_minutes,provider,model',
          user_id: `eq.${userId}`,
        }),
        authorization,
      );
      return rows[0] ?? null;
    },
    async saveDailyPrompt({ authorization, localDate, minutes, model, prompt, provider, timezone, userId }) {
      await request('daily_prompts?on_conflict=user_id,local_date', authorization, {
        body: JSON.stringify({
          estimated_minutes: minutes,
          local_date: localDate,
          model,
          prompt_text: prompt,
          provider,
          timezone,
          user_id: userId,
        }),
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
      });
    },
    async getEntry({ authorization, entryId, userId }) {
      const rows = await request(
        query('entries', {
          // Entries in Recently Deleted are never sent to AI.
          deleted_at: 'is.null',
          id: `eq.${entryId}`,
          is_private: 'eq.false',
          limit: '1',
          select: 'id,title,description,plain_text',
          user_id: `eq.${userId}`,
        }),
        authorization,
      );
      return rows[0] ?? null;
    },
    async getWeeklySummary({ authorization, periodEnd, periodStart, userId }) {
      const rows = await request(
        query('weekly_summaries', {
          limit: '1',
          period_end: `eq.${periodEnd}`,
          period_start: `eq.${periodStart}`,
          select: 'summary,provider,model',
          user_id: `eq.${userId}`,
        }),
        authorization,
      );
      return rows[0] ?? null;
    },
    async listWeeklyEntries({ authorization, endExclusive, periodStart, userId }) {
      return request(
        query('entries', {
          deleted_at: 'is.null',
          entry_date: `gte.${periodStart}T00:00:00`,
          is_private: 'eq.false',
          order: 'entry_date.asc',
          select: 'title,plain_text,mood,entry_date',
          user_id: `eq.${userId}`,
        }) + `&entry_date=lt.${encodeURIComponent(endExclusive)}T00%3A00%3A00`,
        authorization,
      );
    },
    async saveWeeklySummary({ authorization, model, periodEnd, periodStart, provider, summary, userId }) {
      await request('weekly_summaries?on_conflict=user_id,period_start,period_end', authorization, {
        body: JSON.stringify({
          model,
          period_end: periodEnd,
          period_start: periodStart,
          provider,
          summary,
          user_id: userId,
        }),
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
      });
    },
  };
}
