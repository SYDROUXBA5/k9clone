// Hidden <input type=file multiple> for the web build (opened by the drop-zone button).
import type React from 'react';
import { unstable_createElement } from 'react-native-web';

export function WebFileInput({ inputRef, onFiles, testID }: { inputRef: React.MutableRefObject<{ click: () => void } | null>; onFiles: (f: FileList) => void; testID: string }): React.ReactElement | null {
  return unstable_createElement('input', {
    type: 'file',
    multiple: true,
    ref: inputRef,
    'aria-label': 'Supplemental Files',
    'data-testid': testID,
    onChange: (e: { target: { files: FileList; value: string } }) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ''; },
    style: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
  });
}
