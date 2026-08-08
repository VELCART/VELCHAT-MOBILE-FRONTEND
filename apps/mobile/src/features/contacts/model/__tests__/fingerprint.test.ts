import {
  fnv1a,
  contactFingerprint,
  bookHash,
  diffContacts,
  type ContactInput,
} from '../fingerprint';

const c = (
  recordId: string,
  name: string,
  e164s: string[],
  thumbnailPath?: string,
): ContactInput => ({ recordId, name, e164s, thumbnailPath });

describe('fnv1a', () => {
  it('is deterministic + 8 hex chars', () => {
    expect(fnv1a('hello')).toBe(fnv1a('hello'));
    expect(fnv1a('hello')).toMatch(/^[0-9a-f]{8}$/);
  });
  it('differs for different input', () => {
    expect(fnv1a('a')).not.toBe(fnv1a('b'));
  });
});

describe('contactFingerprint', () => {
  it('is stable across phone order + name case/whitespace', () => {
    const a = c('1', 'Mom', ['+91982', '+91981']);
    const b = c('1', '  mom ', ['+91981', '+91982']);
    expect(contactFingerprint(a)).toBe(contactFingerprint(b));
  });
  it('changes on rename', () => {
    expect(contactFingerprint(c('1', 'Mom', ['+9199']))).not.toBe(
      contactFingerprint(c('1', 'Mummy', ['+9199'])),
    );
  });
  it('changes on a new number', () => {
    expect(contactFingerprint(c('1', 'Mom', ['+9199']))).not.toBe(
      contactFingerprint(c('1', 'Mom', ['+9199', '+9198'])),
    );
  });
  it('changes on a new photo', () => {
    expect(contactFingerprint(c('1', 'Mom', ['+9199']))).not.toBe(
      contactFingerprint(c('1', 'Mom', ['+9199'], '/img/a.jpg')),
    );
  });
});

describe('bookHash', () => {
  it('is order-insensitive across the book', () => {
    const x = c('1', 'A', ['+911']);
    const y = c('2', 'B', ['+912']);
    expect(bookHash([x, y])).toBe(bookHash([y, x]));
  });
  it('changes when any contact changes', () => {
    const base = [c('1', 'A', ['+911']), c('2', 'B', ['+912'])];
    const renamed = [c('1', 'A2', ['+911']), c('2', 'B', ['+912'])];
    expect(bookHash(base)).not.toBe(bookHash(renamed));
  });
  it('is empty-stable', () => {
    expect(bookHash([])).toBe(bookHash([]));
  });
});

describe('diffContacts', () => {
  it('detects added, changed, and removed', () => {
    const prev = new Map<string, string>([
      ['1', contactFingerprint(c('1', 'A', ['+911']))],
      ['2', contactFingerprint(c('2', 'B', ['+912']))], // will be removed
    ]);
    const curr = [
      c('1', 'A', ['+911']), // unchanged
      c('3', 'C', ['+913']), // added
    ];
    // mutate 1 → changed
    const currChanged = [c('1', 'A-new', ['+911']), c('3', 'C', ['+913'])];

    const d1 = diffContacts(prev, curr);
    expect(d1.addedOrChanged.map(x => x.recordId)).toEqual(['3']);
    expect(d1.removedIds).toEqual(['2']);

    const d2 = diffContacts(prev, currChanged);
    expect(d2.addedOrChanged.map(x => x.recordId).sort()).toEqual(['1', '3']);
    expect(d2.removedIds).toEqual(['2']);
  });

  it('no changes → empty diff', () => {
    const item = c('1', 'A', ['+911']);
    const prev = new Map([['1', contactFingerprint(item)]]);
    const d = diffContacts(prev, [item]);
    expect(d.addedOrChanged).toEqual([]);
    expect(d.removedIds).toEqual([]);
  });
});
