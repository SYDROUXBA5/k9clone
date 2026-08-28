// Native placeholder — the web build resolves PinPhotoInput.web.tsx. On device the camera/library
// picker belongs to the pin sheet's own button (deferred with the dev-client build, docs/DECISIONS.md).
import type React from 'react';

export function PinPhotoInput(_props: {
  inputRef: React.MutableRefObject<{ click: () => void } | null>;
  onFile: (file: File) => void;
  testID: string;
}): React.ReactElement | null {
  return null;
}
