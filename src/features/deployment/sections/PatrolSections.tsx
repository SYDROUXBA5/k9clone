// One card per deployment patrol section (bar §2.6.2): Non-Search · Building Search · Area Search for
// Humans (Human Search) · Evidence Search · Tracking. Field labels are the reference's verbatim labels.
import React from 'react';
import { View } from 'react-native';
import { BUILDING_TYPES, SEARCH_AREA_TYPES, TERRAIN_TYPES } from '@/db/vocab';
import { Banner, Muted, Row, Select, TextField, VocabMultiSelect, useIsDesktop, space } from '@/ui';
import { AREA_UNITS, DISTANCE_UNITS, OBSTRUCTION_TYPES, WARRANT_TYPES, areaToSquareMetres, distanceToMetres } from '../deploymentModel';
import { NumberField } from '../fields/NumberField';

export interface SectionProps {
  type: string;
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown) => (typeof v === 'number' ? v : null);
const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function PatrolSectionFields({ type, data, onChange, errors, disabled }: SectionProps) {
  const desktop = useIsDesktop();
  const id = slug(type);
  const err = (k: string) => errors[`section-${type}-${k}`];
  const twoCol = desktop ? { flexDirection: 'row' as const, gap: space.md, flexWrap: 'wrap' as const } : undefined;
  const col = desktop ? { flex: 1, minWidth: 200 } : undefined;

  const areaSize = (
    <View style={twoCol}>
      <NumberField label="Area Size" value={n(data.area_size)} onChange={(v) => onChange({ area_size: v, area_size_m2: areaToSquareMetres(v, s(data.area_unit) || 'Square yards') })} editable={!disabled} testID={`input-${id}-area-size`} help="Enter the rough size of the search area." containerStyle={col} />
      <Select label="Area unit" options={AREA_UNITS} value={s(data.area_unit) || 'Square yards'} onChange={(v) => onChange({ area_unit: v, area_size_m2: areaToSquareMetres(n(data.area_size), v) })} disabled={disabled} testID={`select-${id}-area-unit`} allowCustom={false} containerStyle={col} />
    </View>
  );
  const duration = (
    <NumberField label="Search Duration (minutes)" required integer value={n(data.search_duration_min)} onChange={(v) => onChange({ search_duration_min: v })} editable={!disabled} testID={`input-${id}-search-duration`} error={err('search_duration_min')} help="Search durations help rebut “extended search” reliability challenges." />
  );

  switch (type) {
    case 'Non-Search':
      return <VocabMultiSelect label="Warrant Types" customType="warrant_type" options={WARRANT_TYPES} values={arr(data.warrant_types)} onChange={(v) => onChange({ warrant_types: v })} disabled={disabled} testID={`select-${id}-warrant-types`} help="Pick every warrant type used in the deployment." placeholder="Add warrant types" />;
    case 'Building Search':
      return (
        <>
          <VocabMultiSelect label="Building Search Types" required customType="building_type" options={BUILDING_TYPES} values={arr(data.building_types)} onChange={(v) => onChange({ building_types: v })} disabled={disabled} testID={`select-${id}-building-types`} error={err('building_types')} placeholder="Add building types" />
          {arr(data.building_types).includes('Other') ? <TextField label="Other building type" value={s(data.other_building_type)} onChangeText={(v) => onChange({ other_building_type: v })} editable={!disabled} testID={`input-${id}-other-type`} /> : null}
          <View style={twoCol}>
            <View style={col}>{duration}</View>
            <NumberField label="Time Delay (minutes)" integer value={n(data.time_delay_min)} onChange={(v) => onChange({ time_delay_min: v })} editable={!disabled} testID={`input-${id}-time-delay`} help="Approximate minutes between the suspect(s) entering the building and the K-9 team starting to search." containerStyle={col} />
          </View>
          {areaSize}
        </>
      );
    case 'Area Search for Humans':
      return (
        <>
          <VocabMultiSelect label="Search Area Types" required customType="search_area_type" options={SEARCH_AREA_TYPES} values={arr(data.search_area_types)} onChange={(v) => onChange({ search_area_types: v })} disabled={disabled} testID={`select-${id}-search-area-types`} error={err('search_area_types')} placeholder="e.g. Residential, Open field" />
          {duration}
          {areaSize}
        </>
      );
    case 'Evidence Search':
      return (
        <>
          <VocabMultiSelect label="Terrain Types" required customType="terrain_type" options={TERRAIN_TYPES} values={arr(data.terrain_types)} onChange={(v) => onChange({ terrain_types: v })} disabled={disabled} testID={`select-${id}-terrain-types`} error={err('terrain_types')} placeholder="Add terrain types" />
          {duration}
          <TextField label="Article Description" value={s(data.article_description)} onChangeText={(v) => onChange({ article_description: v })} editable={!disabled} testID={`input-${id}-article`} help="Enter the article description if found." />
          {areaSize}
        </>
      );
    case 'Tracking':
      return (
        <>
          <Banner tone={data.gps_found ? 'success' : 'info'} title="Tracking Information" body={data.gps_found ? 'GPS data found — values below were filled from the recorded track.' : 'GPS data not found — fill the section by hand. Only track distance and duration are required.'} testID={`banner-${id}-gps`} style={{ marginBottom: space.md }} />
          <View style={twoCol}>
            <NumberField label="Track Distance" required value={n(data.track_distance)} onChange={(v) => onChange({ track_distance: v, track_distance_m: distanceToMetres(v, s(data.track_distance_unit) || 'Yards') })} editable={!disabled} testID={`input-${id}-distance`} error={err('track_distance')} containerStyle={col} />
            <Select label="Distance unit" required options={DISTANCE_UNITS} value={s(data.track_distance_unit) || 'Yards'} onChange={(v) => onChange({ track_distance_unit: v, track_distance_m: distanceToMetres(n(data.track_distance), v) })} disabled={disabled} testID={`select-${id}-distance-unit`} allowCustom={false} error={err('track_distance_unit')} containerStyle={col} />
          </View>
          <NumberField label="Tracking Duration (minutes)" required integer value={n(data.tracking_duration_min)} onChange={(v) => onChange({ tracking_duration_min: v })} editable={!disabled} testID={`input-${id}-duration`} error={err('tracking_duration_min')} />
          <View style={twoCol}>
            <TextField label="Track Laid Time" value={s(data.track_laid_time)} onChangeText={(v) => onChange({ track_laid_time: v })} editable={!disabled} testID={`input-${id}-laid-time`} placeholder="HH:MM" help="Approximate time the suspect laid the track." containerStyle={col} />
            <TextField label="Track Followed Time" value={s(data.track_followed_time)} onChangeText={(v) => onChange({ track_followed_time: v })} editable={!disabled} testID={`input-${id}-followed-time`} placeholder="HH:MM" help="Approximate time the K9 team began following." containerStyle={col} />
          </View>
          <View style={twoCol}>
            <NumberField label="Total Turns" integer value={n(data.track_turns)} onChange={(v) => onChange({ track_turns: v })} editable={!disabled} testID={`input-${id}-turns`} help="How many times did the K9 team change direction while tracking?" containerStyle={col} />
            <NumberField label="Number of Humans Crossing" integer value={n(data.human_crossings)} onChange={(v) => onChange({ human_crossings: v })} editable={!disabled} testID={`input-${id}-human-crossings`} containerStyle={col} />
            <NumberField label="Number of Animals on Track" integer value={n(data.animals_on_track)} onChange={(v) => onChange({ animals_on_track: v })} editable={!disabled} testID={`input-${id}-animals`} containerStyle={col} />
          </View>
          <VocabMultiSelect label="Terrain Types" required customType="terrain_type" options={TERRAIN_TYPES} values={arr(data.terrain_types)} onChange={(v) => onChange({ terrain_types: v })} disabled={disabled} testID={`select-${id}-terrain-types`} error={err('terrain_types')} placeholder="Add terrain types" />
          <VocabMultiSelect label="Obstruction Types" customType="obstruction_type" options={OBSTRUCTION_TYPES} values={arr(data.obstruction_types)} onChange={(v) => onChange({ obstruction_types: v })} disabled={disabled} testID={`select-${id}-obstruction-types`} placeholder="Add obstruction types" />
        </>
      );
    default:
      return <Row><Muted>No fields for this section.</Muted></Row>;
  }
}
