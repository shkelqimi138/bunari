// Supabase admin client for deleting a user's account, data, and stored media

// Headers for Supabase admin requests with the service-role key (also used by purge-deleted.mjs).
export function adminHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
  };
}

async function checkedJson(fetchImpl, url, serviceRoleKey, init = {}) {
  const response = await fetchImpl(url, {
    ...init,
    headers: { ...adminHeaders(serviceRoleKey), ...init.headers },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Supabase account deletion request failed with ${response.status}.`);
  if (response.status === 204) return null;
  return response.json();
}

async function listStorageFiles(fetchImpl, supabaseUrl, serviceRoleKey, prefix) {
  const files = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const data = await checkedJson(fetchImpl, `${supabaseUrl}/storage/v1/object/list/journal-media`, serviceRoleKey, {
      body: JSON.stringify({ limit, offset, prefix, sortBy: { column: 'name', order: 'asc' } }),
      method: 'POST',
    });
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      if (item.id) files.push(path);
      else files.push(...(await listStorageFiles(fetchImpl, supabaseUrl, serviceRoleKey, path)));
    }
    if (data.length < limit) break;
    offset += data.length;
  }

  return files;
}

export function createSupabaseAccountAdmin({ fetchImpl = fetch, supabaseServiceRoleKey, supabaseUrl }) {
  if (!supabaseServiceRoleKey) return null;

  return {
    async deleteAccount(userId) {
      const encodedUserId = encodeURIComponent(userId);
      const [mediaRows, profileRows, folderPaths] = await Promise.all([
        checkedJson(
          fetchImpl,
          `${supabaseUrl}/rest/v1/entry_media?select=storage_path&user_id=eq.${encodedUserId}`,
          supabaseServiceRoleKey,
        ),
        checkedJson(
          fetchImpl,
          `${supabaseUrl}/rest/v1/profiles?select=avatar_path&id=eq.${encodedUserId}&limit=1`,
          supabaseServiceRoleKey,
        ),
        listStorageFiles(fetchImpl, supabaseUrl, supabaseServiceRoleKey, userId),
      ]);
      const storagePaths = [
        ...new Set(
          [...folderPaths, ...mediaRows.map((row) => row.storage_path), profileRows[0]?.avatar_path].filter(
            (path) => typeof path === 'string' && path.startsWith(`${userId}/`),
          ),
        ),
      ];
      for (let offset = 0; offset < storagePaths.length; offset += 100) {
        await checkedJson(fetchImpl, `${supabaseUrl}/storage/v1/object/journal-media`, supabaseServiceRoleKey, {
          body: JSON.stringify({ prefixes: storagePaths.slice(offset, offset + 100) }),
          method: 'DELETE',
        });
      }

      await checkedJson(fetchImpl, `${supabaseUrl}/auth/v1/admin/users/${encodedUserId}`, supabaseServiceRoleKey, {
        body: JSON.stringify({ should_soft_delete: false }),
        method: 'DELETE',
      });
    },
  };
}
