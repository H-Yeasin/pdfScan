import { StyleSheet, View } from 'react-native';
import { radii, useTheme } from '../../theme';
import type { LibraryDocument } from '../../types/models';
import { FileTypeIcon } from '../library/FileTypeIcon';
import { PageThumb, useThumb } from '../shared/PageThumb';

// §17 U6: a document's first page on Home (Continue and Recent files): its 400 px thumbnail, or the
// format's icon for a file without pages (DOCX, sheets, text) and while the thumbnail is being made.
export function DocThumb({ doc, width, height }: { doc: Pick<LibraryDocument, 'id' | 'format' | 'pages'>; width: number; height: number }) {
  const { tokens } = useTheme();
  const cover = doc.pages[0];
  const uri = useThumb(doc.id, cover);
  return (
    <View style={[styles.box, { width, height, backgroundColor: tokens.surface2 }]}>
      {cover && uri ? <PageThumb documentId={doc.id} page={cover} style={styles.image} /> : <FileTypeIcon format={doc.format} size={Math.round(width * 0.4)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radii.thumb,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
