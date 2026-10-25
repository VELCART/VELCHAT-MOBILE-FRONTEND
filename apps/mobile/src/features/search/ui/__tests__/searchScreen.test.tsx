/**
 * What the search screen actually puts on the glass, per state (§F1, §R1).
 *
 * The defects encoded here:
 *  - the zero state rendered during the debounce, so every search opened with "No results";
 *  - a DB failure rendered that same zero state, blaming the user's spelling for it;
 *  - the browse state with no conversations was a blank screen;
 *  - the filter chips rendered while browsing, where they did nothing yet showed as selected;
 *  - the media chips fell through to "No results — try a different word" for a feature that
 *    does not exist;
 *  - a result row announced only the chat name, on an `accessible` Pressable that hid the
 *    subtitle, the time and the unread state from a screen reader;
 *  - the clear button was labelled "Dismiss";
 *  - the title highlight was a weight swap, which on RN changes the font FILE and therefore
 *    moves the truncation point of a one-line row as the user types.
 */
import React from 'react';
import { StyleSheet, type TextStyle } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../../theme';
import { i18n } from '../../../../i18n';
import { SearchScreen, ResultRow } from '../SearchScreen';
import type { SearchState } from '../../hooks/useSearch';
import type { SearchResult } from '../../model/types';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mockState = jest.fn<SearchState, []>();
const mockRetry = jest.fn();

jest.mock('../../hooks/useSearch', () => ({
  useSearch: () => mockState(),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

const t = (key: string, opts?: Record<string, unknown>): string =>
  i18n.t(key, opts ?? {});

function state(partial: Partial<SearchState>): SearchState {
  return {
    status: 'idle',
    results: [],
    frequent: [],
    frequentLoaded: true,
    unreadMatches: 0,
    retry: mockRetry,
    ...partial,
  };
}

function result(partial: Partial<SearchResult> & { id: string }): SearchResult {
  return {
    kind: 'chat',
    title: 'Tusha',
    titleSpans: [],
    subtitle: 'see you at six',
    subtitleSpans: [],
    time: '4:12 PM',
    unreadCount: 0,
    conversationId: 'c1',
    peerAvatarUrl: undefined,
    conversationName: 'Tusha',
    ...partial,
  };
}

function renderScreen(): void {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider initialMode="light">
        <SearchScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

function renderRow(r: SearchResult): void {
  render(
    <ThemeProvider initialMode="light">
      <ResultRow
        result={r}
        unreadWord={t('search.unreadLabel')}
        openHint={t('search.openChatHint')}
        onOpen={() => undefined}
      />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.mockReturnValue(state({}));
});

describe('the four states', () => {
  it('shows skeleton rows while searching — and NEVER the zero state', () => {
    mockState.mockReturnValue(state({ status: 'searching' }));
    renderScreen();
    fireEvent.changeText(screen.getByLabelText(t('search.inputLabel')), 'a');

    expect(screen.queryByText(t('search.noResults', { q: 'a' }))).toBeNull();
    expect(screen.queryByText(t('search.noResultsSub'))).toBeNull();
    expect(screen.queryByText(t('search.errorTitle'))).toBeNull();
  });

  it('a DB failure gets its own copy and a way out, not "try a different word"', () => {
    mockState.mockReturnValue(state({ status: 'error' }));
    renderScreen();
    fireEvent.changeText(screen.getByLabelText(t('search.inputLabel')), 'abc');

    expect(screen.getByText(t('search.errorTitle'))).toBeOnTheScreen();
    expect(screen.getByText(t('search.errorSub'))).toBeOnTheScreen();
    expect(screen.queryByText(t('search.noResultsSub'))).toBeNull();

    fireEvent.press(screen.getByLabelText(t('search.retry')));
    expect(mockRetry).toHaveBeenCalled();
  });

  it('an honestly empty result still says so', () => {
    mockState.mockReturnValue(state({ status: 'done', results: [] }));
    renderScreen();
    fireEvent.changeText(screen.getByLabelText(t('search.inputLabel')), 'zzz');
    expect(
      screen.getByText(t('search.noResults', { q: 'zzz' })),
    ).toBeOnTheScreen();
  });

  it('a result set gets a visible count in a live region', () => {
    mockState.mockReturnValue(
      state({
        status: 'done',
        results: [
          result({ id: 'a' }),
          result({ id: 'b' }),
          result({ id: 'c' }),
        ],
      }),
    );
    renderScreen();
    fireEvent.changeText(screen.getByLabelText(t('search.inputLabel')), 'tu');
    // Assert the NUMBER reaches the screen, not that the component and the test agree on
    // how to call `t`. The first version of this test passed `{ count: 3 }` — exactly what
    // the component did — so both produced the same wrong string and the test went green
    // while the header rendered the literal "{{n}} results" on a device. A test that mirrors
    // the implementation cannot catch the implementation being wrong.
    const count = t('search.resultCount', { n: 3 });
    expect(count).toContain('3');
    expect(screen.getByText(count)).toBeOnTheScreen();
    expect(screen.queryByText(/\{\{/)).toBeNull();
    expect(screen.getByLabelText(count).props.accessibilityLiveRegion).toBe(
      'polite',
    );
  });

  it('one result is one result, not "1 results"', () => {
    mockState.mockReturnValue(
      state({ status: 'done', results: [result({ id: 'a' })] }),
    );
    renderScreen();
    fireEvent.changeText(screen.getByLabelText(t('search.inputLabel')), 'tu');
    expect(screen.getByText(t('search.resultCountOne'))).toBeOnTheScreen();
  });
});

describe('dead ends', () => {
  it('a browse state with no conversations is a real state, not a blank screen', () => {
    mockState.mockReturnValue(state({ status: 'idle', frequent: [] }));
    renderScreen();
    expect(screen.getByText(t('search.browseEmptyTitle'))).toBeOnTheScreen();
    expect(screen.getByText(t('search.browseEmptySub'))).toBeOnTheScreen();
  });

  it('nothing is claimed before the DB has emitted once', () => {
    mockState.mockReturnValue(
      state({ status: 'idle', frequent: [], frequentLoaded: false }),
    );
    renderScreen();
    expect(screen.queryByText(t('search.browseEmptyTitle'))).toBeNull();
  });

  it('the chips are not shown while browsing, where they do nothing', () => {
    mockState.mockReturnValue(state({ status: 'idle' }));
    renderScreen();
    expect(screen.queryByLabelText(t('search.filters.all'))).toBeNull();
    fireEvent.changeText(screen.getByLabelText(t('search.inputLabel')), 'a');
    expect(screen.getByLabelText(t('search.filters.all'))).toBeOnTheScreen();
  });

  it('the Contacts chip is gone; the one that remains says what it filters', () => {
    mockState.mockReturnValue(state({ status: 'done' }));
    renderScreen();
    fireEvent.changeText(screen.getByLabelText(t('search.inputLabel')), 'a');
    expect(screen.getByLabelText(t('search.filters.chats'))).toBeOnTheScreen();
  });
});

describe('filters that are advertised but not built', () => {
  it.each(['photos', 'videos', 'links', 'docs', 'audio'])(
    'the %s chip says it is unavailable instead of blaming the query',
    key => {
      mockState.mockReturnValue(state({ status: 'done', results: [] }));
      renderScreen();
      fireEvent.changeText(screen.getByLabelText(t('search.inputLabel')), 'a');
      fireEvent.press(screen.getByLabelText(t(`search.filters.${key}`)));

      expect(
        screen.getByText(
          t('search.unavailableTitle', { filter: t(`search.filters.${key}`) }),
        ),
      ).toBeOnTheScreen();
      expect(screen.getByText(t('search.unavailableSub'))).toBeOnTheScreen();
      expect(screen.queryByText(t('search.noResultsSub'))).toBeNull();
    },
  );
});

describe('the search field', () => {
  it('the clear button says it clears the query — it used to say "Dismiss"', () => {
    mockState.mockReturnValue(state({ status: 'done' }));
    renderScreen();
    const input = screen.getByLabelText(t('search.inputLabel'));
    fireEvent.changeText(input, 'abc');
    expect(screen.getByLabelText(t('search.clear'))).toBeOnTheScreen();
    expect(screen.queryByLabelText(t('common.dismiss'))).toBeNull();
  });

  it('does not capitalise what is typed into it', () => {
    renderScreen();
    expect(
      screen.getByLabelText(t('search.inputLabel')).props.autoCapitalize,
    ).toBe('none');
  });
});

describe('a result row', () => {
  it('announces the whole row, not just the chat name', () => {
    renderRow(
      result({
        id: 'a',
        title: 'Tusha',
        subtitle: 'the invoice is paid',
        time: '4:12 PM',
        unreadCount: 3,
      }),
    );
    const label = screen.getByRole('button').props.accessibilityLabel;
    expect(label).toContain('Tusha');
    expect(label).toContain('the invoice is paid');
    expect(label).toContain('4:12 PM');
    expect(label).toContain(t('search.unreadLabel'));
    expect(label).toContain('3');
  });

  it('draws the unread count as a pill, the way the inbox row does', () => {
    renderRow(result({ id: 'a', unreadCount: 120 }));
    expect(screen.getByText('99+')).toBeOnTheScreen();
  });

  it('highlights the match with a FILL, at the same font face as the rest', () => {
    renderRow(
      result({
        id: 'a',
        title: 'Tushar Mehta',
        titleSpans: [{ start: 0, length: 5 }],
      }),
    );
    const matched = StyleSheet.flatten(
      screen.getByText('Tusha').props.style,
    ) as TextStyle;
    const rest = StyleSheet.flatten(
      screen.getByText('Tushar Mehta').props.style,
    ) as TextStyle;

    expect(matched.backgroundColor).toBeTruthy();
    expect(matched.backgroundColor).not.toBe(rest.backgroundColor);
    // The whole point: same FILE, same size, same tracking, so the line cannot reflow and the
    // truncation point cannot move as the query grows.
    expect(matched.fontFamily).toBe(rest.fontFamily);
    expect(matched.fontSize).toBe(rest.fontSize);
    expect(matched.fontWeight).toBeUndefined();
  });

  it('renders the subtitle window verbatim — the hook already found the match', () => {
    renderRow(
      result({
        id: 'a',
        subtitle: '…paid the needle invoice…',
        subtitleSpans: [{ start: 10, length: 6 }],
      }),
    );
    // The window is rendered whole, with only the matched run wrapped for its chip.
    expect(screen.getByText('…paid the needle invoice…')).toBeOnTheScreen();
    expect(screen.getByText('needle')).toBeOnTheScreen();
  });
});
