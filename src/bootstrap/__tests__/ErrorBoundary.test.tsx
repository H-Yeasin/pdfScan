import { useState } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ErrorBoundary } from '../ErrorBoundary';

let shouldThrow = true;
function Bomb() {
  const [mountedAt] = useState(() => Date.now());
  if (shouldThrow) throw new Error('boom');
  return <Text>ok {mountedAt}</Text>;
}

function texts(renderer: ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text).map((t) => [].concat(t.props.children).join(''));
}

describe('ErrorBoundary', () => {
  it('shows a recovery screen and remounts the app on Restart', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const onError = jest.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <ErrorBoundary onError={onError}>
          <Bomb />
        </ErrorBoundary>
      );
    });
    expect(texts(renderer)).toEqual(['Something went wrong.', 'Your documents are safe.', 'Restart']);
    expect(onError).toHaveBeenCalled();

    shouldThrow = false;
    const restart = renderer.root.findAll((n) => n.props.accessibilityRole === 'button' && !!n.props.onPress)[0];
    await act(async () => restart.props.onPress());
    expect(texts(renderer)[0]).toMatch(/^ok /);
  });
});
