// Navigation per role (bar §4 structural facts):
//   Handler    RECORDS · GROUPS · STATS · PROFILE · DOGS · CUSTOM ENTRIES · HISTORY · BILLING
//   Supervisor RECORDS · MANAGE · VACCINES · PROFILE · BILLING  (handler dogs/history open from Manage ⋯ — U5)
//   Trainer    RECORDS · MANAGE · GROUPS · STATS · PROFILE · BILLING  (trainer web nav not evidenced; Manage + Member per §4 row 9)
//   Billing mgr BILLING · PROFILE · HISTORY
import type { Ionicons } from '@expo/vector-icons';
import type { Role } from '@/db/types';

export interface NavItem {
  key: string;
  label: string;
  caption?: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  testID: string;
}

const ITEMS: Record<string, NavItem> = {
  records: { key: 'records', label: 'RECORDS', href: '/records', icon: 'clipboard-outline', testID: 'nav-records' },
  recordsTrainer: { key: 'records', label: 'RECORDS', caption: 'Group events', href: '/records', icon: 'clipboard-outline', testID: 'nav-records' },
  manage: { key: 'manage', label: 'MANAGE', href: '/manage', icon: 'people-outline', testID: 'nav-manage' },
  // [OURS] interim supervisor workspace (docs/DECISIONS.md E12) — folds into RECORDS once the
  // supervisor Records hub carries the review banners + filter bar.
  review: { key: 'review', label: 'REVIEW', caption: 'Needs attention', href: '/review', icon: 'shield-half-outline', testID: 'nav-review' },
  vaccines: { key: 'vaccines', label: 'VACCINES', href: '/vaccines', icon: 'medkit-outline', testID: 'nav-vaccines' },
  groups: { key: 'groups', label: 'GROUPS', href: '/groups', icon: 'people-circle-outline', testID: 'nav-groups' },
  stats: { key: 'stats', label: 'STATS', href: '/stats', icon: 'stats-chart-outline', testID: 'nav-stats' },
  profile: { key: 'profile', label: 'PROFILE', href: '/profile', icon: 'person-circle-outline', testID: 'nav-profile' },
  dogs: { key: 'dogs', label: 'DOGS', href: '/dogs', icon: 'paw-outline', testID: 'nav-dogs' },
  customEntries: { key: 'custom-entries', label: 'CUSTOM ENTRIES', href: '/custom-entries', icon: 'list-outline', testID: 'nav-custom-entries' },
  history: { key: 'history', label: 'HISTORY', href: '/history', icon: 'time-outline', testID: 'nav-history' },
  billing: { key: 'billing', label: 'BILLING', href: '/billing', icon: 'card-outline', testID: 'nav-billing' },
};

export function navItemsFor(role: Role | null): NavItem[] {
  switch (role) {
    case 'trainer':
      return [ITEMS.recordsTrainer, ITEMS.manage, ITEMS.groups, ITEMS.stats, ITEMS.profile, ITEMS.billing];
    case 'supervisor':
      return [ITEMS.records, ITEMS.review, ITEMS.manage, ITEMS.vaccines, ITEMS.profile, ITEMS.billing];
    case 'billing_manager':
      return [ITEMS.billing, ITEMS.profile, ITEMS.history];
    case 'handler':
    default:
      return [ITEMS.records, ITEMS.groups, ITEMS.stats, ITEMS.profile, ITEMS.dogs, ITEMS.customEntries, ITEMS.history, ITEMS.billing];
  }
}

export interface AddMenuItem { key: string; label: string; href: string; icon: keyof typeof Ionicons.glyphMap; testID: string; mobileOnly?: boolean; divider?: boolean; badge?: string }
export const ADD_MENU: AddMenuItem[] = [
  { key: 'quick', label: 'Solo Quick Training', href: '/quick-training', icon: 'flash-outline', testID: 'add-quick-training', mobileOnly: true, badge: 'NEW!' },
  { key: 'training', label: 'Training Record', href: '/records/training/new', icon: 'clipboard-outline', testID: 'add-training-record' },
  { key: 'deployment', label: 'Deployment Record', href: '/records/deployment/new', icon: 'shield-half-outline', testID: 'add-deployment-record' },
  { key: 'class', label: 'Class Record', href: '/records/class/new', icon: 'school-outline', testID: 'add-class-record' },
  { key: 'vet', label: 'Vet Visit', href: '/records/vet/new', icon: 'medkit-outline', testID: 'add-vet-visit' },
  { key: 'track', label: 'Location Track', href: '/tracking', icon: 'navigate-outline', testID: 'add-location-track', mobileOnly: true, divider: true },
  { key: 'report', label: 'Create Report', href: '/reports', icon: 'document-text-outline', testID: 'add-create-report', divider: true },
];

/** Screen titles by first path segment (top bar on phone, document title on web). */
export const SCREEN_TITLES: Record<string, string> = {
  records: 'Records', groups: 'Groups', stats: 'Stats', profile: 'Profile', dogs: 'Dogs', 'custom-entries': 'Custom Entries',
  history: 'History', billing: 'Billing', manage: 'Manage', vaccines: 'Vaccines', reports: 'Reports', tracking: 'Tracking',
  notifications: 'Notifications', settings: 'Settings', 'quick-training': 'Solo Quick Training', support: 'Support',
  review: 'Review',
};
