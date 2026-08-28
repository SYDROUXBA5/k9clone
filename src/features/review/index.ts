// U5 review feature — public surface for U3/U4 record views (mount these) and U6 reports (read comments).
export { ReviewBar, RejectedBanner, OutdatedBanner, ReviewStatePill, RecordStatePills, useReviewAccess } from './ReviewBar';
export { TrainerCommentButton, TrainerComments, useCanTrainerComment } from './TrainerComments';
export { ShareButton } from './ShareButton';
export { RecordReviewScreen, RecordReviewRoute } from './RecordReviewScreen';
export { ExerciseDetailsScreen } from './ExerciseDetailsScreen';
export {
  afterHandlerSave, markResubmitted, setReviewed, setNotReviewed, rejectRecord, effectiveReview, isRejectedOpen,
  isOutdated, outdatedDiff, acknowledgeOutdated, saveExerciseDetails, getSupervisorBanners, reviewRoute, recordRoute,
  isLateCompletion, lateCompletionsOf, LATE_RULE_TEXT,
  supervisorsOf, trainersOf, notifyManagersOfSave, type ReviewableType, type ReviewableRow, type SupervisorBanners,
} from '@/db/review';
