// The masthead every generated report prints at the top (PT-PRO-05) and the one report option that
// hides data (PT-PRO-08). Both live on the signed-in user, and both are set on Profile.
//
// This exists as a hook rather than as markup because /reports is U6's unit and is still a stub here.
// U6 renders the header; U7 owns what goes in it. Keeping the contract in one exported function means
// the two units cannot drift into printing different department names.
import type { User } from '@/db/types';
import { useAuth } from '@/features/auth/AuthProvider';

export interface ReportHeader {
  /** Department logo to print at the top-left of page 1, or null to print the name alone. */
  logoUri: string | null;
  /** Department name — the group-subscription name wins, because that is who is billed. */
  departmentName: string;
  /** Who generated the report, printed under the masthead. */
  preparedBy: string;
  /** PT-PRO-08: print Race/Ethnicity, Sex At Birth and Age of arrested subjects. Data is collected either way. */
  includeDemographics: boolean;
}

export function reportHeaderFor(user: User | null | undefined): ReportHeader {
  return {
    logoUri: user?.department_logo_uri ?? null,
    departmentName: user?.group_department_name?.trim() || user?.department?.trim() || '',
    preparedBy: user?.name ?? '',
    // Absent means "yes": a report that silently dropped columns would be worse than one that prints
    // them, and the toggle is opt-out in the reference too.
    includeDemographics: user?.demographics_in_reports !== false,
  };
}

export function useReportHeader(): ReportHeader {
  const { user } = useAuth();
  return reportHeaderFor(user);
}
