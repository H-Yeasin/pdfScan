import { useEffect } from 'react';
import type { ImageStyle, StyleProp } from 'react-native';
import { requestThumb, thumbFor } from '../../services/library/thumbnails';
import type { LibraryPage } from '../../types/models';
import { rotationStyle } from '../../utils/rotation';
import { AppImage } from './AppImage';

type ThumbPage = Pick<LibraryPage, 'id' | 'thumbUri'>;

// §16 G6: a library page's thumbnail for a list, never its 2400 px master. While the page has
// none this is undefined (the caller shows its placeholder) and the thumbnail is asked for; it
// arrives with the next render of the document. `documentId` undefined: nothing is built.
export function useThumb(documentId: string | undefined, page: ThumbPage | undefined): string | undefined {
  const uri = thumbFor(page);
  const pageId = page?.id;
  useEffect(() => {
    if (!uri && documentId && pageId) requestThumb(documentId, pageId);
  }, [uri, documentId, pageId]);
  return uri;
}

type PageThumbProps = {
  documentId: string;
  page: Pick<LibraryPage, 'id' | 'thumbUri' | 'rotation'>;
  style?: StyleProp<ImageStyle>;
};

// The thumbnail with the page's turn, or nothing while it's being made: the box around it has
// the placeholder colour.
export function PageThumb({ documentId, page, style }: PageThumbProps) {
  const uri = useThumb(documentId, page);
  if (!uri) return null;
  return <AppImage uri={uri} recyclingKey={page.id} style={[style, rotationStyle(page.rotation)]} />;
}
