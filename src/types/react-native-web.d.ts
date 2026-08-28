// Minimal typing for the one react-native-web export we use in *.web.tsx files.
declare module 'react-native-web' {
  import type * as React from 'react';
  export function unstable_createElement(
    component: string,
    props?: Record<string, unknown>,
    ...children: React.ReactNode[]
  ): React.ReactElement;
}
