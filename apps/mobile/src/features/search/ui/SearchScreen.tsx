/**
 * Search screen (§F1) — the app-wide search opened from the home header. An "Ask Vel AI or
 * Search" field, scrollable type filters, a recent-chats row, and a virtualised result list
 * with the matched term highlighted. Fully theme-aware (light + dark).
 *
 * Data is REAL and LOCAL (§M0): `useSearch` queries the same WatermelonDB the chat list + chat
 * screen read — conversations + messages, offline-first, never the network. There is no server
 * full-text search for personal chats (content is/will be opaque).
 *
 * Three things about this screen are deliberate and easy to undo by accident.
 *
 * 1. It renders FOUR states, from the hook's `status`, not from `query !== ''`. The zero state
 *    is reachable only from `done`, so a search no longer opens by saying "No results for “a”"
 *    while the debounce is still running, and a DB failure is its own state rather than an
 *    empty one that blames the user's spelling.
 * 2. The list is a `FlashList`, the row is memoised, its callback is hoisted, and the highlight
 *    runs are computed in the hook. The previous version mapped up to 100 rows into a
 *    `ScrollView` and compiled a RegExp per text node per render.
 * 3. The media filters say they are unavailable instead of falling through to "no results".
 *    Nothing in this app indexes media yet; a filter that cannot be served does not get to
 *    imply the user typed the wrong word — and does not pay for a table scan either.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  TextInput,
  Pressable,
  ScrollView,
  type ViewStyle,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../theme';
import { useTranslation } from '../../../i18n';
import {
  Text,
  SearchIcon,
  ChevronRightIcon,
  ChatIcon,
  MailIcon,
  ImageIcon,
  VideoIcon,
  LinkIcon,
  FileTextIcon,
  HeadphonesIcon,
  UserIcon,
  CloseIcon,
  AlertCircleIcon,
  spacing,
  type IconProps,
} from '../../../design-system';
import type { RootStackParamList } from '../../../navigation/types';
import { useSearch, type SearchFilter } from '../hooks/useSearch';
import type { SearchResult, FrequentChat } from '../model/types';
import type { HighlightSpan } from '../model/snippet';
import { searchPalette } from '../model/searchPalette';
import { avatarColor, avatarInitial } from '../model/avatar';

/** Same avatar, same gaps, same pressed treatment as `features/chat/ui/ChatsList.tsx`. */
const AVATAR = 54;
/** Enough rows to fill the viewport while the query is in flight, and not one more. */
const SKELETON_ROWS = 8;

type FilterMode = 'all' | 'unread' | 'chats' | 'unavailable';

interface FilterDef {
  readonly key: string;
  readonly icon?: React.FC<IconProps>;
  readonly mode: FilterMode;
}

/**
 * `unavailable` is the honest name for Photos/Videos/Links/Docs/Audio: `runSearch` has never
 * produced a media hit, because there is no local media index to produce one from. They used
 * to map to result kinds nothing emitted and land on "No results — try a different word".
 *
 * `contacts` is gone. It mapped to the `chat` kind, which includes groups, and the `contact`
 * kind it implied was never produced — so the chip lied twice. It is now `chats`, which is
 * exactly what it filters to, and the dead `contact` branch of the leading tile is deleted.
 */
const FILTERS: readonly FilterDef[] = [
  { key: 'all', mode: 'all' },
  { key: 'unread', icon: MailIcon, mode: 'unread' },
  { key: 'photos', icon: ImageIcon, mode: 'unavailable' },
  { key: 'videos', icon: VideoIcon, mode: 'unavailable' },
  { key: 'links', icon: LinkIcon, mode: 'unavailable' },
  { key: 'docs', icon: FileTextIcon, mode: 'unavailable' },
  { key: 'audio', icon: HeadphonesIcon, mode: 'unavailable' },
  { key: 'chats', icon: ChatIcon, mode: 'chats' },
];

const CHIP_HIT_SLOP = { top: 8, bottom: 8, left: 4, right: 4 };
const TAP_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

/**
 * Text with its matched runs drawn on a background chip.
 *
 * NOT a colour + weight change, which is what this replaces. `brandFrom` is defined identical
 * to `textPrimary` in both themes, so a highlighted title was a 1.00:1 colour change carried
 * entirely by one weight step — and on RN a weight step is a different font FILE, so the
 * truncation point of a one-line row moved while the user typed. Face, size and letter
 * spacing are now untouched; only the fill behind the run changes, so nothing reflows.
 *
 * The spans arrive pre-computed from the hook; nothing is searched or compiled here.
 */
function HighlightedText({
  text,
  spans,
  variant,
  style,
  numberOfLines,
}: {
  text: string;
  spans: readonly HighlightSpan[];
  variant: 'label' | 'caption' | 'body';
  style: { fontSize: number; color: string };
  numberOfLines?: number;
}): React.JSX.Element {
  const t = useTheme();
  const p = searchPalette(t.scheme);
  const numProps = numberOfLines !== undefined ? { numberOfLines } : {};

  if (spans.length === 0) {
    return (
      <Text variant={variant} style={style} {...numProps}>
        {text}
      </Text>
    );
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const span of spans) {
    const start = Math.max(cursor, span.start);
    const end = Math.min(text.length, span.start + span.length);
    if (end <= start) continue;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <Text
        key={`${start}-${end}`}
        variant={variant}
        style={[
          style,
          { backgroundColor: p.highlightBg, color: p.highlightText },
        ]}
      >
        {text.slice(start, end)}
      </Text>,
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <Text variant={variant} style={style} {...numProps}>
      {parts}
    </Text>
  );
}

/** The conversation avatar — the same object the inbox draws, so the row reads as the same chat. */
function Leading({ title }: { title: string }): React.JSX.Element {
  const t = useTheme();
  const p = searchPalette(t.scheme);
  const initial = avatarInitial(title);
  return (
    <View
      style={{
        width: AVATAR,
        height: AVATAR,
        borderRadius: AVATAR / 2,
        backgroundColor: initial ? avatarColor(title) : p.fieldBg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        // An unnamed chat falls back to the subtle fill, which is 1.06:1 against the page —
        // the ring is what makes it a shape rather than a hole.
        ...(initial ? {} : { borderWidth: 1, borderColor: p.fieldBorder }),
      }}
    >
      {initial ? (
        <Text variant="title" style={{ color: '#fff' }}>
          {initial}
        </Text>
      ) : (
        <UserIcon size={26} color={p.metaText} strokeWidth={2} />
      )}
    </View>
  );
}

interface ResultRowProps {
  readonly result: SearchResult;
  readonly unreadWord: string;
  readonly openHint: string;
  readonly onOpen: (conversationId: string, name: string) => void;
}

/**
 * Memoised, and handed a STABLE `onOpen` from the parent, so a keystroke re-renders only the
 * rows whose data actually changed. The old row rebuilt an inline arrow per row per render.
 */
function ResultRowBase({
  result,
  unreadWord,
  openHint,
  onOpen,
}: ResultRowProps): React.JSX.Element {
  const t = useTheme();
  const p = searchPalette(t.scheme);
  const unread = result.unreadCount > 0;
  // One label for the whole row. It used to announce the chat name and nothing else, on an
  // `accessible` Pressable — which HIDES the children, so the subtitle, the time and the
  // unread state were unreachable and a screen-reader user got strictly less than a sighted
  // one: a list of names with no reason for any of them being there.
  const label = [
    result.title,
    result.subtitle,
    result.time,
    unread ? `${unreadWord}, ${result.unreadCount}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={openHint}
      onPress={() => onOpen(result.conversationId, result.conversationName)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingHorizontal: t.spacing.lg,
        paddingVertical: t.spacing.sm,
        backgroundColor: pressed ? t.colors.bgSubtle : 'transparent',
      })}
    >
      <Leading title={result.title} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <HighlightedText
              text={result.title}
              spans={result.titleSpans}
              variant={unread ? 'label' : 'body'}
              style={{ fontSize: 17, color: t.colors.textPrimary }}
              numberOfLines={1}
            />
          </View>
          {result.time ? (
            <Text
              variant="caption"
              style={{
                fontSize: 12.5,
                marginLeft: t.spacing.xs,
                color: unread ? t.colors.textPrimary : p.metaText,
              }}
            >
              {result.time}
            </Text>
          ) : null}
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.xs,
          }}
        >
          <View style={{ flex: 1 }}>
            <HighlightedText
              text={result.subtitle}
              spans={result.subtitleSpans}
              variant="caption"
              style={{
                fontSize: 14,
                color: unread ? t.colors.textPrimary : t.colors.textSecondary,
              }}
              numberOfLines={1}
            />
          </View>
          {unread ? (
            <View
              style={{
                minWidth: 20,
                height: 20,
                paddingHorizontal: 6,
                borderRadius: 10,
                backgroundColor: t.colors.brandFrom,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                variant="caption"
                style={{ color: t.colors.actionFg, fontSize: 12 }}
              >
                {result.unreadCount > 99 ? '99+' : result.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export const ResultRow = React.memo(ResultRowBase);

/**
 * A placeholder row with the EXACT geometry of a real one. A spinner was rejected: the list
 * would collapse to a centred dot and then jump back to full height on every settled
 * keystroke, which on the reference device reads as the screen flickering.
 */
function SkeletonRow(): React.JSX.Element {
  const t = useTheme();
  const p = searchPalette(t.scheme);
  const bar = (width: number | `${number}%`, height: number): ViewStyle => ({
    width,
    height,
    borderRadius: height / 2,
    backgroundColor: p.skeleton,
  });
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        paddingHorizontal: t.spacing.lg,
        paddingVertical: t.spacing.sm,
      }}
    >
      <View
        style={{
          width: AVATAR,
          height: AVATAR,
          borderRadius: AVATAR / 2,
          backgroundColor: p.skeleton,
        }}
      />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={bar('55%', 15)} />
        <View style={bar('80%', 13)} />
      </View>
    </View>
  );
}

function FilterChip({
  label,
  icon: Icon,
  active,
  badge,
  onPress,
}: {
  label: string;
  icon?: React.FC<IconProps>;
  active: boolean;
  badge?: number;
  onPress: () => void;
}): React.JSX.Element {
  const t = useTheme();
  const p = searchPalette(t.scheme);
  const fg = active ? p.chipActiveText : p.chipText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      // 36dp tall by design; the slop is what makes it a 52dp target (§M18).
      hitSlop={CHIP_HIT_SLOP}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.xxs,
        height: 36,
        paddingHorizontal: t.spacing.md,
        borderRadius: t.radius.pill,
        backgroundColor: active ? p.chipActiveBg : p.fieldBg,
        borderWidth: 1,
        borderColor: active ? p.chipActiveBg : p.fieldBorder,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {Icon ? <Icon size={16} color={fg} strokeWidth={2} /> : null}
      <Text variant="caption" style={{ color: fg }}>
        {label}
      </Text>
      {badge ? (
        <View
          style={{
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 5,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active ? p.chipActiveText : t.colors.brandFrom,
          }}
        >
          <Text
            variant="caption"
            style={{
              fontSize: 11,
              lineHeight: 14,
              color: active ? p.chipActiveBg : t.colors.actionFg,
            }}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function FrequentAvatar({
  name,
  onPress,
}: {
  name: string;
  onPress: () => void;
}): React.JSX.Element {
  const t = useTheme();
  const p = searchPalette(t.scheme);
  const initial = avatarInitial(name);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 72,
        alignItems: 'center',
        gap: t.spacing.xxs,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: initial ? avatarColor(name) : p.fieldBg,
          alignItems: 'center',
          justifyContent: 'center',
          // Was `hairline` on `bgSubtle` — 1.10:1, a ring that rendered as nothing.
          ...(initial ? {} : { borderWidth: 1, borderColor: p.fieldBorder }),
        }}
      >
        {initial ? (
          <Text variant="title" style={{ color: '#fff' }}>
            {initial}
          </Text>
        ) : (
          <UserIcon size={24} color={p.metaText} strokeWidth={2} />
        )}
      </View>
      <Text variant="caption" numberOfLines={1} style={{ color: p.metaText }}>
        {name.split(' ')[0]}
      </Text>
    </Pressable>
  );
}

/** A centred icon + title + body, used by all three of the screen's dead ends. */
function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.FC<IconProps>;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}): React.JSX.Element {
  const t = useTheme();
  const p = searchPalette(t.scheme);
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: t.spacing.xl,
        paddingBottom: t.spacing.huge,
        gap: t.spacing.xxs,
      }}
    >
      <Icon size={40} color={p.metaText} strokeWidth={1.6} />
      <Text
        variant="title"
        align="center"
        style={{ marginTop: t.spacing.sm, fontSize: 19 }}
      >
        {title}
      </Text>
      <Text variant="body" align="center" style={{ color: p.metaText }}>
        {body}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          hitSlop={TAP_HIT_SLOP}
          style={({ pressed }) => ({
            marginTop: t.spacing.md,
            paddingHorizontal: t.spacing.lg,
            paddingVertical: t.spacing.xs,
            borderRadius: t.radius.pill,
            backgroundColor: p.chipActiveBg,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text variant="label" style={{ color: p.chipActiveText }}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const CHIPS_CONTENT_STYLE: ViewStyle = {
  paddingHorizontal: spacing.lg,
  gap: spacing.xs,
  paddingBottom: spacing.sm,
};
const FREQUENT_CONTENT_STYLE: ViewStyle = { gap: spacing.sm };

export function SearchScreen(): React.JSX.Element {
  const t = useTheme();
  const p = searchPalette(t.scheme);
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [filterIdx, setFilterIdx] = useState(0);

  const active = FILTERS[filterIdx] ?? FILTERS[0];
  const mode: FilterMode = active?.mode ?? 'all';
  const unavailable = mode === 'unavailable';

  const filter = useMemo<SearchFilter>(
    () => ({ unreadOnly: mode === 'unread', chatsOnly: mode === 'chats' }),
    [mode],
  );

  // A filter this build cannot serve does not pay for a `LIKE '%x%'` scan over two tables.
  const { status, results, frequent, frequentLoaded, unreadMatches, retry } =
    useSearch(unavailable ? '' : query, filter);

  const browsing = query.trim() === '';

  // The chips are hidden while browsing — they filter results, and there are none — so a
  // selection left over from the last search must not survive invisibly into the next one.
  useEffect(() => {
    if (browsing) setFilterIdx(0);
  }, [browsing]);

  const openChat = useCallback(
    (conversationId: string, name: string) => {
      navigation.navigate('Chat', { conversationId, name });
    },
    [navigation],
  );

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const clearQuery = useCallback(() => {
    setQuery('');
    inputRef.current?.focus();
  }, []);

  const unreadWord = tr('search.unreadLabel');
  const openHint = tr('search.openChatHint');
  const renderItem = useCallback(
    ({ item }: { item: SearchResult }) => (
      <ResultRow
        result={item}
        unreadWord={unreadWord}
        openHint={openHint}
        onOpen={openChat}
      />
    ),
    [openChat, unreadWord, openHint],
  );
  const keyExtractor = useCallback((item: SearchResult) => item.id, []);
  const listContentStyle = useMemo<ViewStyle>(
    () => ({ paddingBottom: insets.bottom + spacing.xl }),
    [insets.bottom],
  );

  // Let the screen paint FIRST (navigation feels instant), then focus on the very next frame
  // so raising the keyboard can't jank the push. autoFocus does it DURING the push (Android
  // window-resize hitch → "slow"); InteractionManager waits too long.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // What a screen reader is told when the list changes under it. Results used to swap in
  // complete silence, and there was no visible count either.
  const countLabel =
    results.length === 1
      ? tr('search.resultCountOne')
      : // `n`, NOT `count`. The string interpolates `{{n}}`, so `count` rendered the
        // placeholder literally — the header read "{{n}} results" on screen. `count` is also
        // i18next's RESERVED plural key: passing it routes the lookup through
        // `Intl.PluralRules`, which Hermes does not guarantee, which is the whole reason this
        // string is a pair of explicit keys rather than a plural form.
        tr('search.resultCount', { n: results.length });
  const announcement = unavailable
    ? tr('search.unavailableTitle', {
        filter: tr(`search.filters.${active?.key ?? 'all'}`),
      })
    : status === 'searching'
      ? tr('search.searching')
      : status === 'error'
        ? tr('search.errorTitle')
        : status === 'done' && results.length === 0
          ? tr('search.noResults', { q: query.trim() })
          : countLabel;

  function renderBody(): React.JSX.Element {
    if (unavailable) {
      const filterName = tr(`search.filters.${active?.key ?? 'all'}`);
      return (
        <EmptyState
          icon={active?.icon ?? SearchIcon}
          title={tr('search.unavailableTitle', { filter: filterName })}
          body={tr('search.unavailableSub')}
        />
      );
    }

    if (status === 'idle') {
      if (frequent.length > 0) {
        return (
          <View style={{ paddingHorizontal: t.spacing.lg }}>
            <Text
              variant="caption"
              style={{ marginBottom: t.spacing.xs, color: p.metaText }}
            >
              {tr('search.frequent')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={FREQUENT_CONTENT_STYLE}
            >
              {frequent.map((c: FrequentChat) => (
                <FrequentAvatar
                  key={c.id}
                  name={c.name}
                  onPress={() => openChat(c.id, c.name)}
                />
              ))}
            </ScrollView>
          </View>
        );
      }
      // Nothing to browse. Gated on the first DB emission so it cannot flash on mount, and a
      // real state rather than the blank screen a new account used to open on.
      return frequentLoaded ? (
        <EmptyState
          icon={ChatIcon}
          title={tr('search.browseEmptyTitle')}
          body={tr('search.browseEmptySub')}
        />
      ) : (
        <View />
      );
    }

    if (status === 'searching') {
      return (
        <View>
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      );
    }

    if (status === 'error') {
      return (
        <EmptyState
          icon={AlertCircleIcon}
          title={tr('search.errorTitle')}
          body={tr('search.errorSub')}
          action={{ label: tr('search.retry'), onPress: retry }}
        />
      );
    }

    if (results.length === 0) {
      return (
        <EmptyState
          icon={SearchIcon}
          title={tr('search.noResults', { q: query.trim() })}
          body={tr('search.noResultsSub')}
        />
      );
    }

    return (
      <FlashList
        data={results}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // Without this a long result list is stuck in the top half of the screen behind the
        // keyboard, with no way to see the rest of it.
        keyboardDismissMode="on-drag"
      />
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: p.pageBg,
        paddingTop: insets.top,
      }}
    >
      {/* Search field — the back arrow lives INSIDE the bar (in place of the search icon);
          no separate header row, so the whole control sits in one clean place. */}
      <View
        style={{
          paddingHorizontal: t.spacing.sm,
          paddingTop: t.spacing.xs,
          paddingBottom: t.spacing.sm,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.xs,
            height: 48,
            borderRadius: t.radius.pill,
            backgroundColor: p.fieldBg,
            // `bgSubtle` on `bgBase` is 1.06:1 — the field had no boundary at all. WCAG 1.4.11
            // wants 3:1 for the edge of a control, and this clears it in both themes.
            borderWidth: 1,
            borderColor: p.fieldBorder,
            paddingLeft: t.spacing.xxs,
            paddingRight: t.spacing.md,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('profile.back')}
            onPress={goBack}
            hitSlop={TAP_HIT_SLOP}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.5 : 1,
            })}
          >
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <ChevronRightIcon
                size={24}
                color={p.inputText}
                strokeWidth={2.2}
              />
            </View>
          </Pressable>
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            accessibilityLabel={tr('search.inputLabel')}
            placeholder={tr('search.placeholder')}
            placeholderTextColor={p.placeholder}
            returnKeyType="search"
            autoCorrect={false}
            // A name typed in lower case is still the name; the keyboard capitalising it was
            // only ever a reason to delete a character.
            autoCapitalize="none"
            autoComplete="off"
            keyboardAppearance={t.scheme === 'dark' ? 'dark' : 'light'}
            style={{
              flex: 1,
              fontFamily: t.typography.body.fontFamily,
              fontSize: 16,
              color: p.inputText,
              paddingVertical: 0,
            }}
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              // It CLEARS the query. It used to be labelled `common.dismiss` ("Dismiss"),
              // which describes closing the screen — the one thing it does not do.
              accessibilityLabel={tr('search.clear')}
              onPress={clearQuery}
              hitSlop={TAP_HIT_SLOP}
              style={({ pressed }) => ({
                width: 24,
                height: 24,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.5 : 1,
              })}
            >
              <CloseIcon size={20} color={p.metaText} strokeWidth={2} />
            </Pressable>
          ) : (
            <SearchIcon size={20} color={p.inputText} strokeWidth={1.8} />
          )}
        </View>
      </View>

      {/* Type filters — only once there is something to filter. They used to render while
          browsing, where they did nothing at all yet still showed one of them as selected. */}
      {browsing ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // The input auto-focuses (keyboard up on entry) → without this the first tap on a
          // chip is eaten to dismiss the keyboard and the filter wouldn't change.
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={CHIPS_CONTENT_STYLE}
          style={{ flexGrow: 0 }}
        >
          {FILTERS.map((f, i) => (
            <FilterChip
              key={f.key}
              label={tr(`search.filters.${f.key}`)}
              {...(f.icon ? { icon: f.icon } : {})}
              active={i === filterIdx}
              {...(f.mode === 'unread' && unreadMatches
                ? { badge: unreadMatches }
                : {})}
              onPress={() => setFilterIdx(i)}
            />
          ))}
        </ScrollView>
      )}

      {/* The count, and the live region that makes a silent swap audible. */}
      {browsing ? null : (
        <View
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={announcement}
          // The height is reserved whether or not the count is in it, so the list does not
          // shift down by a line the moment a query settles.
          style={{
            minHeight: t.typography.caption.lineHeight,
            paddingHorizontal: t.spacing.lg,
            paddingBottom: t.spacing.xs,
          }}
        >
          {!unavailable && status === 'done' && results.length > 0 ? (
            <Text variant="caption" style={{ color: p.metaText }}>
              {countLabel}
            </Text>
          ) : null}
        </View>
      )}

      <View style={{ flex: 1 }}>{renderBody()}</View>
    </View>
  );
}
