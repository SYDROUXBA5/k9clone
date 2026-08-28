import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { LiveTrackScreen } from '@/features/tracking';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LiveTrackScreen id={String(id || '')} />;
}
