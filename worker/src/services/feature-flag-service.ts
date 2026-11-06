import type { Env } from '../env.ts';
import { HttpError } from '../lib/http.ts';
import { audit } from '../lib/auth.ts';
import { likeEscape } from './suggest-service.ts';

export interface FeatureFlag {
  key: string;
  category: 'BOOKING_DOMAIN' | 'PRODUCT_INGESTION' | 'AUTOMATION' | 'FINANCIAL' | 'SYSTEM';
  display_name: string;
  description: string;
  is_enabled: number;
  default_enabled: number;
  requires_flags: string[];
  is_external_dependent: number;
  external_contract_status: 'NOT_REQUIRED' | 'PENDING_CONTRACT' | 'ACTIVE';
  updated_by: string | null;
  updated_at: string;
}

export async function getAllFeatureFlags(env: Env): Promise<FeatureFlag[]> {
  const rows = await env.DB.prepare('SELECT * FROM feature_flags ORDER BY category, key').all();
  return (rows.results || []).map((r: any) => ({
    key: r.key,
    category: r.category,
    display_name: r.display_name,
    description: r.description,
    is_enabled: Number(r.is_enabled),
    default_enabled: Number(r.default_enabled),
    requires_flags: JSON.parse(r.requires_flags || '[]'),
    is_external_dependent: Number(r.is_external_dependent),
    external_contract_status: r.external_contract_status,
    updated_by: r.updated_by,
    updated_at: r.updated_at
  }));
}

export async function isFeatureEnabled(env: Env, flagKey: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT is_enabled FROM feature_flags WHERE key = ?')
    .bind(flagKey)
    .first<{ is_enabled: number }>();
  if (!row) return true; // Default to enabled if flag is unmanaged
  return Number(row.is_enabled) === 1;
}

export async function updateFeatureFlag(
  env: Env,
  flagKey: string,
  isEnabled: boolean,
  adminId: string,
  reason?: string
): Promise<FeatureFlag> {
  const existing = await env.DB.prepare('SELECT * FROM feature_flags WHERE key = ?')
    .bind(flagKey)
    .first<any>();

  if (!existing) {
    throw new HttpError(404, 'FLAG_NOT_FOUND', `Feature flag '${flagKey}' not found.`);
  }

  const newEnabledInt = isEnabled ? 1 : 0;
  const currentEnabledInt = Number(existing.is_enabled);

  if (newEnabledInt === currentEnabledInt) {
    return {
      ...existing,
      is_enabled: newEnabledInt,
      requires_flags: JSON.parse(existing.requires_flags || '[]')
    };
  }

  // Check 1: If turning ON, all required flags must already be ON
  if (isEnabled) {
    const required: string[] = JSON.parse(existing.requires_flags || '[]');
    if (required.length > 0) {
      const placeholders = required.map(() => '?').join(',');
      const reqRows = await env.DB.prepare(`SELECT key, is_enabled, display_name FROM feature_flags WHERE key IN (${placeholders})`)
        .bind(...required)
        .all<any>();

      const disabledPrereqs = (reqRows.results || []).filter((r: any) => Number(r.is_enabled) === 0);
      if (disabledPrereqs.length > 0) {
        const names = disabledPrereqs.map((d: any) => `${d.display_name}(${d.key})`).join(', ');
        throw new HttpError(
          400,
          'DEPENDENCY_VIOLATION',
          `해당 기능을 활성화하려면 먼저 필수 선행 기능 [${names}]을(를) 활성화해야 합니다.`
        );
      }
    }
  }

  // Check 2: If turning OFF, warn if other active flags depend on this one
  if (!isEnabled) {
    const dependentFlags = await env.DB.prepare(
      "SELECT key, display_name FROM feature_flags WHERE is_enabled = 1 AND requires_flags LIKE ? ESCAPE '\\'"
    )
      .bind(`%"${likeEscape(flagKey)}"%`)
      .all<any>();

    if (dependentFlags.results && dependentFlags.results.length > 0) {
      const depNames = dependentFlags.results.map((d: any) => `${d.display_name}(${d.key})`).join(', ');
      throw new HttpError(
        400,
        'CASCADE_DEPENDENCY_BLOCK',
        `이 기능을 비활성화하려면 먼저 이에 의존하고 있는 [${depNames}] 기능을 비활성화해야 합니다.`
      );
    }
  }

  // Apply update
  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE feature_flags SET is_enabled = ?, updated_by = ?, updated_at = ? WHERE key = ?'
  )
    .bind(newEnabledInt, adminId, now, flagKey)
    .run();

  // Audit Log
  await audit(env, adminId, 'FEATURE_FLAG_UPDATE', 'FEATURE_FLAG', flagKey, {
    old_enabled: currentEnabledInt === 1,
    new_enabled: isEnabled,
    reason: reason || 'Admin toggled feature flag'
  });

  return {
    ...existing,
    is_enabled: newEnabledInt,
    updated_by: adminId,
    updated_at: now,
    requires_flags: JSON.parse(existing.requires_flags || '[]')
  };
}

