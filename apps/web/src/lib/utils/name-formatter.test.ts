import { formatFullName } from './name-formatter';

describe('formatFullName', () => {
  it('includes middle name when present', () => {
    expect(
      formatFullName({ firstName: 'Jane', middleName: 'Ann', lastName: 'Doe' })
    ).toBe('Jane Ann Doe');
  });

  it('omits middle name when null', () => {
    expect(
      formatFullName({ firstName: 'Jane', middleName: null, lastName: 'Doe' })
    ).toBe('Jane Doe');
  });

  it('omits middle name when undefined', () => {
    expect(
      formatFullName({ firstName: 'Jane', middleName: undefined, lastName: 'Doe' })
    ).toBe('Jane Doe');
  });

  it('omits middle name when whitespace-only', () => {
    expect(
      formatFullName({ firstName: 'Jane', middleName: '   ', lastName: 'Doe' })
    ).toBe('Jane Doe');
  });
});
