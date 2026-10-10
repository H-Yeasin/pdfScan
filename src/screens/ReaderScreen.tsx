import { StyleSheet, View } from 'react-native';
import { ReaderDocumentView } from '../components/reader/ReaderDocumentView';
import { ReaderNotice } from '../components/reader/ReaderLoadProblem';
import { useReaderSubject } from '../components/reader/useReaderDocument';
import { useT } from '../i18n/useT';
import { useTheme } from '../theme';

// The Reader screen: which file this instance shows, and one ReaderDocumentView for it.
// §18 W6: the view is keyed on the file, so opening another one (a converted copy, an edited
// copy, an outside file just added to the library) mounts a new view. That replaced the effects
// that reset the position, the password, Find and the bars one by one, and it also closes
// whatever sheet or tool the last file had open.
export function ReaderScreen() {
  const { tokens } = useTheme();
  const { t } = useT();
  const { inert, doc, external, viewKey } = useReaderSubject();

  // §18 W5: a Reader that has never been on screen has no document to show.
  if (inert) return <View style={[styles.container, { backgroundColor: tokens.bg }]} />;

  if (!doc && !external) return <ReaderNotice body={t('reader.notFound')} />;

  return <ReaderDocumentView key={viewKey} doc={doc} external={external} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
