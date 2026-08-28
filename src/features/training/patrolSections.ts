// Per-patrol-type completion sections (bar §2.4 rows 1–25 verbatim where evidenced; [OURS] minimal sets
// for the types the vendor never photographed: Agility, Area Search for Humans, Building Search, Other).
// Data-driven so the completion form and Solo Quick Training render the same fields in the same order.
import { BITE_RELEASE, BUILDING_TYPES, CONTAMINANT_TYPES, EQUIPMENT_USED, LEASH_STATES, OBEDIENCE_TYPES, SEARCH_AREA_TYPES, TERRAIN_TYPES } from '@/db/vocab';

export type SectionFieldKind = 'yesno' | 'text' | 'number' | 'time' | 'multi' | 'single' | 'checklist' | 'items' | 'number_unit';
export interface SectionField {
  key: string;
  label: string;
  kind: SectionFieldKind;
  options?: readonly string[] | readonly { value: string; label: string; description?: string }[];
  customType?: string;
  units?: readonly string[];
  /** stored metric key when kind === number_unit (imperial shown) */
  help?: string;
}
export interface SectionDef { type: string; header: string; fields: SectionField[]; evidenced: boolean }

export const OBEDIENCE_CHECKLIST: string[] = OBEDIENCE_TYPES.flatMap((t) => LEASH_STATES.map((l) => `${t}: ${l}`));

export const PATROL_SECTIONS: Record<string, SectionDef> = {
  Obedience: {
    type: 'Obedience', header: 'OBEDIENCE', evidenced: true,
    fields: [{ key: 'obedience_types', label: 'Obedience Types', kind: 'checklist', options: OBEDIENCE_CHECKLIST }],
  },
  Tracking: {
    type: 'Tracking', header: 'TRACKING', evidenced: true,
    fields: [
      { key: 'track_location_known', label: 'Track Location Known', kind: 'yesno' },
      { key: 'controlled_negative', label: 'Controlled Negative', kind: 'yesno' },
      { key: 'track_name', label: 'Track Name', kind: 'text' },
      { key: 'track_distance_m', label: 'Track Distance', kind: 'number_unit', units: ['Miles', 'Yards'] },
      { key: 'track_turns', label: 'Track Turns', kind: 'number' },
      { key: 'track_laid_time', label: 'Track Laid Time', kind: 'time' },
      { key: 'track_followed_time', label: 'Track Followed Time', kind: 'time' },
      { key: 'track_duration_min', label: 'Track Duration (minutes)', kind: 'number' },
      { key: 'human_crossings', label: 'Number of Human Crossings', kind: 'number' },
      { key: 'terrain_types', label: 'Terrain Types', kind: 'multi', options: TERRAIN_TYPES, customType: 'terrain_type' },
      { key: 'contaminant_types', label: 'Contaminant Types', kind: 'multi', options: CONTAMINANT_TYPES, customType: 'contaminant_type' },
    ],
  },
  'Criminal Apprehension / Aggression Control': {
    type: 'Criminal Apprehension / Aggression Control', header: 'APPREHENSION', evidenced: true,
    fields: [
      { key: 'recall', label: 'Recall / Call off', kind: 'yesno' },
      { key: 'dog_in_guard_position', label: 'Dog In Guard Position', kind: 'yesno' },
      { key: 'decoy_name', label: 'Decoy Name', kind: 'text' },
      { key: 'equipment_used', label: 'Equipment Used', kind: 'multi', options: EQUIPMENT_USED, customType: 'equipment' },
      { key: 'bite_release', label: 'Bite Release', kind: 'single', options: BITE_RELEASE },
    ],
  },
  'Area Search for Evidence': {
    type: 'Area Search for Evidence', header: 'EVIDENCE SEARCH', evidenced: true,
    fields: [
      { key: 'monitor', label: 'Monitor', kind: 'text' },
      { key: 'controlled_negative', label: 'Controlled Negative', kind: 'yesno' },
      { key: 'items', label: 'Items', kind: 'items', help: 'Item 1, Item 2 … the articles placed for the search.' },
      { key: 'terrain_types', label: 'Terrain Types', kind: 'multi', options: TERRAIN_TYPES, customType: 'terrain_type' },
      { key: 'area_size_sq_yd', label: 'Area Size', kind: 'number_unit', units: ['Square yards', 'Acres'] },
    ],
  },
  // [OURS] — the vendor never photographed these completion sections; minimal, consistent with the deployment form.
  'Area Search for Humans': {
    type: 'Area Search for Humans', header: 'AREA SEARCH FOR HUMANS', evidenced: false,
    fields: [
      { key: 'search_area_types', label: 'Search Area Types', kind: 'multi', options: SEARCH_AREA_TYPES, customType: 'search_area_type' },
      { key: 'area_size_sq_yd', label: 'Area Size', kind: 'number_unit', units: ['Square yards', 'Acres'] },
      { key: 'search_duration_min', label: 'Search Duration (minutes)', kind: 'number' },
      { key: 'decoy_found', label: 'Decoy Found', kind: 'yesno' },
    ],
  },
  'Building Search': {
    type: 'Building Search', header: 'BUILDING SEARCH', evidenced: false,
    fields: [
      { key: 'building_types', label: 'Building Types', kind: 'multi', options: BUILDING_TYPES, customType: 'building_type' },
      { key: 'rooms_searched', label: 'Rooms Searched', kind: 'number' },
      { key: 'decoy_found', label: 'Decoy Found', kind: 'yesno' },
      { key: 'search_duration_min', label: 'Search Duration (minutes)', kind: 'number' },
    ],
  },
  'Agility / Obstacle Course': {
    type: 'Agility / Obstacle Course', header: 'AGILITY', evidenced: false,
    fields: [
      { key: 'obstacles', label: 'Obstacles', kind: 'items', help: 'Obstacle 1, Obstacle 2 …' },
      { key: 'completed_all', label: 'Completed All Obstacles', kind: 'yesno' },
    ],
  },
  Other: {
    type: 'Other', header: 'OTHER', evidenced: false,
    fields: [{ key: 'description', label: 'Description', kind: 'text' }],
  },
};

export function sectionFor(type: string): SectionDef {
  return PATROL_SECTIONS[type] || { type, header: type.toUpperCase(), evidenced: false, fields: [{ key: 'notes', label: 'Notes', kind: 'text' }] };
}
