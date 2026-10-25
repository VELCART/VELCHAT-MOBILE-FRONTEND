/**
 * The shape of a result list a person can actually read: chats and messages are different
 * answers, and one chat does not print its own name fifty times.
 */
import { sectionise, type SearchRow } from '../sections';
import type { SearchResult } from '../types';

const TITLES = { chats: 'Chats', messages: 'Messages' };

function res(over: Partial<SearchResult> & { id: string }): SearchResult {
  return {
    kind: 'message',
    title: 'Ada',
    titleSpans: [],
    subtitle: '',
    subtitleSpans: [],
    time: '',
    unreadCount: 0,
    conversationId: 'c1',
    conversationName: 'Ada',
    peerAvatarUrl: undefined,
    ...over,
  };
}

const headers = (rows: readonly SearchRow[]): string[] =>
  rows.filter(r => r.kind === 'header').map(r => r.title);

const chromeFlags = (rows: readonly SearchRow[]): boolean[] =>
  rows.flatMap(r => (r.kind === 'result' ? [r.showChrome] : []));

describe('sectionise', () => {
  it('puts chats first, then messages, each under its own heading', () => {
    const rows = sectionise(
      [res({ id: 'm1' }), res({ id: 'c1', kind: 'chat' }), res({ id: 'm2' })],
      TITLES,
    );
    expect(headers(rows)).toEqual(['Chats', 'Messages']);
    expect(rows.map(r => r.id)).toEqual([
      'h_chats',
      'c1',
      'h_messages',
      'm1',
      'm2',
    ]);
  });

  it('grows no heading for a section with nothing in it', () => {
    expect(headers(sectionise([res({ id: 'm1' })], TITLES))).toEqual([
      'Messages',
    ]);
    expect(
      headers(sectionise([res({ id: 'c1', kind: 'chat' })], TITLES)),
    ).toEqual(['Chats']);
    expect(sectionise([], TITLES)).toEqual([]);
  });

  it('names a chat once for a run of its messages — the whole point', () => {
    const rows = sectionise(
      [
        res({ id: 'm1', conversationId: 'a' }),
        res({ id: 'm2', conversationId: 'a' }),
        res({ id: 'm3', conversationId: 'a' }),
      ],
      TITLES,
    );
    expect(chromeFlags(rows)).toEqual([true, false, false]);
  });

  it('announces each run, so an interleaved list never leaves a row unattributed', () => {
    const rows = sectionise(
      [
        res({ id: 'm1', conversationId: 'a' }),
        res({ id: 'm2', conversationId: 'b' }),
        res({ id: 'm3', conversationId: 'a' }),
      ],
      TITLES,
    );
    expect(chromeFlags(rows)).toEqual([true, true, true]);
  });

  it('always draws chrome on a CHAT row, however many there are', () => {
    const rows = sectionise(
      [
        res({ id: 'c1', kind: 'chat', conversationId: 'a' }),
        res({ id: 'c2', kind: 'chat', conversationId: 'a' }),
      ],
      TITLES,
    );
    expect(chromeFlags(rows)).toEqual([true, true]);
  });

  it('leaves the order inside a section exactly as ranked', () => {
    const rows = sectionise(
      [
        res({ id: 'm3', conversationId: 'c' }),
        res({ id: 'm1', conversationId: 'a' }),
        res({ id: 'm2', conversationId: 'b' }),
      ],
      TITLES,
    );
    expect(rows.flatMap(r => (r.kind === 'result' ? [r.id] : []))).toEqual([
      'm3',
      'm1',
      'm2',
    ]);
  });
});
