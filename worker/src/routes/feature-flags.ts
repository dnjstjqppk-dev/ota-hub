import type { Env } from '../env.ts';
import { HttpError, json, readJson } from '../lib/http.ts';
import { requireAdmin } from '../lib/auth.ts';
import { getAllFeatureFlags, updateFeatureFlag } from '../services/feature-flag-service.ts';

export async function handleFeatureFlags(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  // 1. Public client endpoint: GET /api/v1/feature-flags
  if (path === '/api/v1/feature-flags' && method === 'GET') {
    const flags = await getAllFeatureFlags(env);
    const map: Record<string, boolean> = {};
    flags.forEach((f) => {
      map[f.key] = f.is_enabled === 1;
    });

    return json({
      success: true,
      flags: map,
      registry: flags.map((f) => ({
        key: f.key,
        category: f.category,
        display_name: f.display_name,
        is_enabled: f.is_enabled === 1,
        requires_flags: f.requires_flags,
        is_external_dependent: f.is_external_dependent === 1,
        external_contract_status: f.external_contract_status
      }))
    }, 200, {
      'Cache-Control': 'public, max-age=15, stale-while-revalidate=30'
    });
  }

  // 2. Admin detailed endpoint: GET /api/v1/admin/feature-flags
  if (path === '/api/v1/admin/feature-flags' && method === 'GET') {
    await requireAdmin(request, env);
    const flags = await getAllFeatureFlags(env);
    return json({
      success: true,
      flags
    });
  }

  // 3. Admin toggle endpoint: PATCH /api/v1/admin/feature-flags/:key
  const toggleMatch = path.match(/^\/api\/v1\/admin\/feature-flags\/([A-Za-z0-9_]+)$/);
  if (toggleMatch && method === 'PATCH') {
    const admin = await requireAdmin(request, env);
    const flagKey = toggleMatch[1];
    const body = await readJson(request);
    
    if (typeof body.is_enabled !== 'boolean') {
      throw new HttpError(400, 'INVALID_BODY', "'is_enabled' boolean 값(true 또는 false)이 필요합니다.");
    }

    const updated = await updateFeatureFlag(
      env,
      flagKey,
      body.is_enabled,
      admin.id,
      body.reason
    );

    return json({
      success: true,
      flag: updated,
      message: `Feature flag '${flagKey}' 상태가 ${body.is_enabled ? 'ON(활성화)' : 'OFF(비활성화)'} (으)로 변경되었습니다.`
    });
  }

  return null;
}

