/**
 * Photos for chats the user has never opened.
 *
 * `refreshPeerIdentity` only ever ran from the chat screen, so a conversation's picture
 * appeared the first time you went inside it and not before — which is why the list showed a
 * face for some people and a coloured initial for others.
 */
const mockGetProfile = jest.fn();
const mockGetMediaUrl = jest.fn();
const mockUpsert = jest.fn();
const mockAge = jest.fn();

jest.mock('../../../../infra', () => ({
  upsertConversation: (id: string, patch: unknown) => mockUpsert(id, patch),
  peerIdentityAgeMs: (id: string) => mockAge(id),
  conversationIdsForPeer: () => Promise.resolve([]),
}));
jest.mock('../../../../core', () => ({
  subscribeProfileChanged: () => () => undefined,
}));
jest.mock('../../../user', () => ({
  getProfile: (id: string) => mockGetProfile(id),
  getMediaUrl: (id: string) => mockGetMediaUrl(id),
}));
jest.mock('../../../contacts', () => ({
  discoveredContacts: () => [],
  peerDisplayName: (_c: unknown, _p: string, fallback: string) => fallback,
}));

import {
  backfillPeerIdentities,
  clearPeerIdentityAttempts,
} from '../refreshPeerIdentity';

type Row = {
  id: string;
  peerId: string | undefined;
  peerAvatarUrl: string | undefined;
};

const row = (over: Partial<Row> & { id: string }): Row => ({
  peerId: `p_${over.id}`,
  peerAvatarUrl: undefined,
  ...over,
});

beforeEach(() => {
  clearPeerIdentityAttempts();
  mockUpsert.mockReset().mockResolvedValue(undefined);
  mockAge.mockReset().mockResolvedValue(null);
  mockGetMediaUrl.mockReset().mockResolvedValue({ url: 'https://x/a.jpg' });
  mockGetProfile
    .mockReset()
    .mockResolvedValue({ displayName: 'Ada', avatarMediaId: 'm1' });
});

describe('backfillPeerIdentities', () => {
  it('resolves a photo for a chat that has none', async () => {
    await backfillPeerIdentities([row({ id: 'c1' })]);
    expect(mockUpsert).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ peerAvatarUrl: 'https://x/a.jpg' }),
    );
  });

  it('leaves a chat that already has one alone', async () => {
    await backfillPeerIdentities([
      row({ id: 'c1', peerAvatarUrl: 'https://x/have.jpg' }),
    ]);
    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it('skips a conversation with no peer — a group has no face to fetch', async () => {
    await backfillPeerIdentities([row({ id: 'c1', peerId: undefined })]);
    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it('is bounded: twenty at most, however long the list is', async () => {
    const many = Array.from({ length: 50 }, (_, i) => row({ id: `c${i}` }));
    await backfillPeerIdentities(many);
    expect(mockGetProfile).toHaveBeenCalledTimes(20);
  });

  it('does not ask twice for the same chat in one session', async () => {
    await backfillPeerIdentities([row({ id: 'c1' })]);
    await backfillPeerIdentities([row({ id: 'c1' })]);
    expect(mockGetProfile).toHaveBeenCalledTimes(1);
  });

  it('retries after a failure, so an offline launch does not cost the session its photos', async () => {
    mockGetProfile.mockRejectedValueOnce(new Error('offline'));
    await backfillPeerIdentities([row({ id: 'c1' })]);
    expect(mockUpsert).not.toHaveBeenCalled();

    await backfillPeerIdentities([row({ id: 'c1' })]);
    expect(mockUpsert).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ peerAvatarUrl: 'https://x/a.jpg' }),
    );
  });

  it('respects the TTL — a recently resolved chat is not re-fetched', async () => {
    mockAge.mockResolvedValue(1000); // fresh
    await backfillPeerIdentities([row({ id: 'c1' })]);
    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it('writes a name even when the peer has no picture set', async () => {
    mockGetProfile.mockResolvedValue({
      displayName: 'Ada',
      avatarMediaId: undefined,
    });
    await backfillPeerIdentities([row({ id: 'c1' })]);
    expect(mockGetMediaUrl).not.toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ name: 'Ada' }),
    );
  });
});
