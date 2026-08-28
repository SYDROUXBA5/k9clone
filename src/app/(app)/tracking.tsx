import { Redirect } from 'expo-router';
import React from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { SupervisorTrackingScreen, TrackingModeScreen } from '@/features/tracking';

export default function Route() {
  const { status, role } = useAuth();
  // The no-account track layer has its own public route outside the signed-in area.
  if (status === 'layer') return <Redirect href="/track-layer" />;
  // Supervisors and trainers do not lay tracks — they watch the ones their handlers make.
  if (role === 'supervisor' || role === 'trainer') return <SupervisorTrackingScreen />;
  return <TrackingModeScreen />;
}
