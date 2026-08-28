// /settings — kept only so an old link or a typed URL lands somewhere sensible.
//
// Theme, units and notification preferences all live on Profile, and nothing in the app links here.
// This route previously shipped a developer placeholder that printed internal unit codes at the user;
// it now redirects to the screen that actually holds those settings.
import { Redirect } from 'expo-router';
import React from 'react';

export default function Route() {
  return <Redirect href="/profile" />;
}
