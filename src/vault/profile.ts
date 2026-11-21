// Player identity on this device. `?as=<slot>` gives a tab its own identity (e.g. the host's
// "new person joins" side panel), so two people can join from one machine.
import type { Look } from '@/lib/types';

export interface Profile { userId?: string; name?: string; look?: Look }

export const profileKey = (as: string | null | undefined) =>
  as ? `sv-profile-${as.replace(/[^a-z0-9-]/gi, '').slice(0, 24)}` : 'sv-profile';

export function loadProfile(key: string): Profile {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

export function saveProfile(key: string, p: Profile) {
  try {
    localStorage.setItem(key, JSON.stringify(p));
  } catch {
    /* private mode: identity lasts for this page only */
  }
}
