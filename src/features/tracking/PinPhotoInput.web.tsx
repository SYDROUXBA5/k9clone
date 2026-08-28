// Hidden <input type="file" accept="image/*"> behind the pin sheet's "Add photo" button (web build).
import type React from 'react';
import { unstable_createElement } from 'react-native-web';

export function PinPhotoInput({ inputRef, onFile, testID }: {
  inputRef: React.MutableRefObject<{ click: () => void } | null>;
  onFile: (file: File) => void;
  testID: string;
}): React.ReactElement | null {
  return unstable_createElement('input', {
    type: 'file',
    accept: 'image/*',
    ref: inputRef,
    'aria-label': 'Pin photo',
    'data-testid': testID,
    onChange: (e: { target: { files: FileList; value: string } }) => {
      const f = e.target.files?.[0];
      if (f) onFile(f);
      e.target.value = '';
    },
    style: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
  });
}
