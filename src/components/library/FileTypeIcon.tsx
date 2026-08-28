import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import type { DocFormat } from '../../types/models';

const ICON_BY_FORMAT: Record<DocFormat, keyof typeof Ionicons.glyphMap> = {
  PDF: 'document-text-outline',
  JPG: 'image-outline',
  DOCX: 'document-text-outline',
  DOC: 'document-text-outline',
  XLSX: 'grid-outline',
  XLS: 'grid-outline',
  CSV: 'list-outline',
  TXT: 'reader-outline',
};

type FileTypeIconProps = {
  format: DocFormat;
  size: number;
};

// Fallback cover for library documents with no raster page image to thumbnail (every non-PDF/JPG
// format - see FileRow's cover?.fileUri check).
export function FileTypeIcon({ format, size }: FileTypeIconProps) {
  const { tokens } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.accentSoft }}>
      <Ionicons name={ICON_BY_FORMAT[format]} size={size} color={tokens.accentInk} />
    </View>
  );
}
