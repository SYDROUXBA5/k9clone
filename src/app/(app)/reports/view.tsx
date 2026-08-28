// /reports/view?type=<report type>&id=<record id>&dog=&from=&to=&handler=&ids= — the report viewer.
// Reached from the Records row ⋯ menu ("View Report") and from the report dialog's VIEW / DOWNLOAD.
//
// MERGE NOTE (U6 + U8). U8 shipped an interim block here that rendered <TrackingMapSection/> so a
// tracking record's report was not blank where the map belongs, and left a TODO asking the merge to
// pass hasTrackingSection={false}. That TODO is resolved by deletion: the real report body draws its
// own track (src/reports/TrackImage.tsx, called from fullRecord.tsx for both the exercise and the
// deployment sheet), so the report no longer goes through TrackingMapSection at all and can no longer
// claim it filled a TRACKING section. TrackingMapSection stays in use where the sentence is true —
// the record editors, CompletionForm.tsx and DeploymentScreen.tsx.
import React from 'react';
import { ReportViewScreen } from '@/features/reports/ReportViewScreen';

export default function Route() {
  return <ReportViewScreen />;
}
