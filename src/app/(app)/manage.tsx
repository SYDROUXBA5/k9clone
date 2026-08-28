import React from 'react';
import { ManageScreen } from '@/features/groups/ManageScreen';
import { RoleGuard } from '@/features/nav/RoleGuard';

export default function Route() {
  return <RoleGuard allow={['supervisor', 'trainer']} title="Manage"><ManageScreen /></RoleGuard>;
}
