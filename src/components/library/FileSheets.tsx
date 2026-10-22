import { useEffect, useState } from 'react';
import { useT } from '../../i18n/useT';
import { renamedTo } from '../../services/library/rename';
import type { LibraryDocument } from '../../types/models';
import { Button, ListItem, Sheet, Text, TextField } from '../ui';

// §17 U7: the sheets Files' actions ask in. On U3's Sheet (built early here); U3's Dialog and
// useConfirm will take over Rename and the confirms without the callers changing.

type RenameSheetProps = {
  doc: LibraryDocument | null;
  onRename: (doc: LibraryDocument, name: string) => void;
  onClose: () => void;
};

// The name, prefilled and selected so typing replaces it. Save stays off while the cleaned name
// is empty or what it was (rename.renamedTo).
export function RenameSheet({ doc, onRename, onClose }: RenameSheetProps) {
  const { t } = useT();
  const [name, setName] = useState('');
  useEffect(() => {
    if (doc) setName(doc.name);
  }, [doc]);
  const next = doc ? renamedTo(doc.name, name) : null;
  const save = () => {
    if (!doc || !next) return;
    onClose();
    onRename(doc, name);
  };

  return (
    <Sheet
      visible={doc !== null}
      onClose={onClose}
      title={t('library.renameTitle')}
      testID="files-rename"
      footer={
        <>
          <Button label={t('common.cancel')} variant="ghost" onPress={onClose} />
          <Button label={t('reader.save')} onPress={save} disabled={!next} testID="files-rename-save" />
        </>
      }
    >
      {doc ? (
        <TextField
          value={name}
          onChangeText={setName}
          label={t('library.renameLabel')}
          autoFocus
          selectTextOnFocus
          clearable
          returnKeyType="done"
          onSubmitEditing={save}
          error={name.trim() ? undefined : t('library.renameEmpty')}
          testID="files-rename-field"
        />
      ) : null}
    </Sheet>
  );
}

export type KeepOriginalsAsk = { kind: 'merge' | 'split'; docs: LibraryDocument[] };

type KeepOriginalsSheetProps = {
  ask: KeepOriginalsAsk | null;
  onConfirm: (ask: KeepOriginalsAsk, deleteOriginals: boolean) => void;
  onClose: () => void;
};

// Merge or split, and whether the originals go. They stay unless the box is ticked: a merge used to
// delete them, and a student who only wanted one PDF to send lost the separate ones.
export function KeepOriginalsSheet({ ask, onConfirm, onClose }: KeepOriginalsSheetProps) {
  const { t } = useT();
  const [deleteOriginals, setDeleteOriginals] = useState(false);
  useEffect(() => {
    if (ask) setDeleteOriginals(false);
  }, [ask]);
  const merge = ask?.kind === 'merge';
  const count = merge ? (ask?.docs.length ?? 0) : (ask?.docs[0]?.pages.length ?? 0);

  return (
    <Sheet
      visible={ask !== null}
      onClose={onClose}
      title={merge ? t('library.mergeAsk.title', { count }) : t('library.splitAsk.title')}
      testID="files-keep-originals"
      footer={
        <>
          <Button label={t('common.cancel')} variant="ghost" onPress={onClose} />
          <Button
            label={merge ? t('library.tools.merge') : t('library.tools.split')}
            onPress={() => {
              if (!ask) return;
              onClose();
              onConfirm(ask, deleteOriginals);
            }}
            testID="files-keep-originals-confirm"
          />
        </>
      }
    >
      <Text variant="body" color="muted">
        {merge ? t('library.mergeAsk.body', { count }) : t('library.splitAsk.body', { count, name: ask?.docs[0]?.name ?? '' })}
      </Text>
      <ListItem
        title={merge ? t('library.mergeAsk.deleteOriginals') : t('library.splitAsk.deleteOriginal')}
        subtitle={t('library.mergeAsk.deleteHint')}
        selected={deleteOriginals}
        onPress={() => setDeleteOriginals((v) => !v)}
        testID="files-delete-originals"
      />
    </Sheet>
  );
}
