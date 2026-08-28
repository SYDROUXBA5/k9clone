import React from 'react';
import { RoleGuard } from '@/features/nav/RoleGuard';
import { VaccinesScreen } from '@/features/vet/VaccinesScreen';

export default function Route() {
  return <RoleGuard allow={['supervisor', 'trainer']} title="Vaccines"><VaccinesScreen /></RoleGuard>;
}
