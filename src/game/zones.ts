// Which zone the player stands in → GameEvent 'zone' (CLAUDE.md §6.3). Lane GAME.
import { emit } from '@/lib/events';
import type { Section } from '@/lib/types';
import { INTERIOR, SECTIONS, sectionById } from './world/interior';
import { STREET } from './world/street';

export type SceneId = 'street' | 'interior';
export type Zone = Section | 'door' | null;

export function zoneAt(scene: SceneId, x: number): Zone {
  if (scene === 'street') return x >= STREET.door.x0 && x <= STREET.door.x1 ? 'door' : null;
  if (x >= INTERIOR.exitDoor.x0 && x < INTERIOR.exitDoor.x1) return 'door';
  return SECTIONS.find((s) => x >= s.x0 && x < s.x1)?.id ?? null;
}

/** Text for the floating interact chip, or null when there's nothing to do here. */
export function zoneLabel(scene: SceneId, zone: Zone): string | null {
  if (zone === null) return null;
  if (zone === 'door') return scene === 'street' ? '▲ ENTER' : '▲ EXIT';
  if (zone === 'counter') return '▲ ASK RICO';
  if (zone === 'staffpicks') return '▲ STAFF PICKS';
  if (zone === 'yourshelf') return '▲ YOUR SHELF';
  return `▲ BROWSE ${sectionById(zone)?.label ?? zone.toUpperCase()}`;
}

/** Emits { type: 'zone' } only when the zone changes. */
export function createZoneTracker() {
  let current: Zone | undefined;
  let currentScene: SceneId | undefined;
  return {
    update(scene: SceneId, x: number): { zone: Zone; changed: boolean } {
      const zone = zoneAt(scene, x);
      const changed = zone !== current || scene !== currentScene;
      if (changed) {
        current = zone;
        currentScene = scene;
        emit({ type: 'zone', section: zone });
      }
      return { zone, changed };
    },
    reset() {
      current = undefined;
      currentScene = undefined;
    },
  };
}
