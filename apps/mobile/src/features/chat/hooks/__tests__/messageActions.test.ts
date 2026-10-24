/**
 * `useMessageActions` — the owner state machine behind the hold-a-message sheet (§R1).
 *
 * The contract it has to keep is mostly about what it does NOT do. Copy and delete are
 * fire-and-forget: the caller is a press handler on the render path, so neither may be awaited
 * and neither may throw into it (§M0 rule 2). The sheet must still have something to draw while
 * it animates out, so the target outlives `close()` and only `visible` flips. And the clipboard
 * timer it starts is owned — it is disposed on unmount, or it outlives the screen (§M20.3).
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';

const mockCopy = jest.fn();
const mockDispose = jest.fn();
const mockDelete = jest.fn((_id: string) => Promise.resolve());

// Lazy wrappers: `jest.mock` is hoisted above the consts, so a factory naming them directly
// would capture `undefined` and the assertions would pass for the wrong reason.
jest.mock('../../../../infra', () => ({
  copyWithAutoClear: (...args: unknown[]) => {
    mockCopy(...args);
    return mockDispose;
  },
  deleteMessageForMe: (id: string) => mockDelete(id),
}));

import { useMessageActions } from '../useMessageActions';

beforeEach(() => {
  jest.clearAllMocks();
  mockDelete.mockImplementation(() => Promise.resolve());
});

describe('opening and closing', () => {
  it('starts with nothing open', () => {
    const { result } = renderHook(() => useMessageActions('c1'));
    expect(result.current.visible).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it('carries the id, body and ownership of the held message', () => {
    const { result } = renderHook(() => useMessageActions('c1'));
    act(() => result.current.open('m1', 'hello there', true));

    expect(result.current.visible).toBe(true);
    expect(result.current.target).toEqual({
      id: 'm1',
      text: 'hello there',
      mine: true,
    });
  });

  it('keeps the target through close so the sheet has something to draw on the way out', () => {
    const { result } = renderHook(() => useMessageActions('c1'));
    act(() => result.current.open('m1', 'hello there', false));
    act(() => result.current.close());

    expect(result.current.visible).toBe(false);
    expect(result.current.target).not.toBeNull();
  });

  it('closes when the screen switches conversation — a sheet must not outlive its thread', () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useMessageActions(id),
      { initialProps: { id: 'c1' } },
    );
    act(() => result.current.open('m1', 'hello there', false));

    rerender({ id: 'c2' });

    expect(result.current.visible).toBe(false);
    expect(result.current.target).toBeNull();
  });
});

describe('copy', () => {
  it('writes the held message body to the clipboard and closes', () => {
    const { result } = renderHook(() => useMessageActions('c1'));
    act(() => result.current.open('m1', 'hello there', false));
    act(() => result.current.copy());

    expect(mockCopy).toHaveBeenCalledWith('hello there');
    expect(result.current.visible).toBe(false);
  });

  it('writes nothing when there is no body to copy', () => {
    const { result } = renderHook(() => useMessageActions('c1'));
    act(() => result.current.open('m1', '', false));
    act(() => result.current.copy());

    expect(mockCopy).not.toHaveBeenCalled();
  });

  it('does nothing at all when no message is held', () => {
    const { result } = renderHook(() => useMessageActions('c1'));
    act(() => result.current.copy());

    expect(mockCopy).not.toHaveBeenCalled();
  });

  it('disposes the clipboard auto-clear timer on unmount (§M20.3)', () => {
    const { result, unmount } = renderHook(() => useMessageActions('c1'));
    act(() => result.current.open('m1', 'hello there', false));
    act(() => result.current.copy());

    expect(mockDispose).not.toHaveBeenCalled();
    unmount();
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });
});

describe('delete', () => {
  it('soft-deletes the held message and closes, without awaiting', () => {
    const { result } = renderHook(() => useMessageActions('c1'));
    act(() => result.current.open('m9', 'bye', true));
    act(() => result.current.remove());

    expect(mockDelete).toHaveBeenCalledWith('m9');
    expect(result.current.visible).toBe(false);
  });

  it('does nothing when no message is held', () => {
    const { result } = renderHook(() => useMessageActions('c1'));
    act(() => result.current.remove());

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('swallows a failed delete rather than crashing the thread', async () => {
    mockDelete.mockImplementation(() => Promise.reject(new Error('disk full')));
    const { result } = renderHook(() => useMessageActions('c1'));
    act(() => result.current.open('m9', 'bye', true));

    expect(() => act(() => result.current.remove())).not.toThrow();
    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
  });
});

describe('identity', () => {
  it('keeps stable callbacks so a memoised bubble is not re-rendered by the sheet', () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useMessageActions(id),
      { initialProps: { id: 'c1' } },
    );
    const open = result.current.open;
    const close = result.current.close;
    act(() => result.current.open('m1', 'hi', false));
    rerender({ id: 'c1' });

    expect(result.current.open).toBe(open);
    expect(result.current.close).toBe(close);
  });
});
