import { formatFullName } from '../name-formatter';

describe('formatFullName', () => {
  it('includes middle name when present', () => {
    expect(
      formatFullName({
        firstName: 'John',
        middleName: 'Paul',
        lastName: 'Smith',
      }),
    ).toBe('John Paul Smith');
  });

  it('omits middle name when undefined', () => {
    expect(
      formatFullName({
        firstName: 'John',
        middleName: undefined,
        lastName: 'Smith',
      }),
    ).toBe('John Smith');
  });

  it('omits middle name when null', () => {
    expect(
      formatFullName({
        firstName: 'John',
        middleName: null,
        lastName: 'Smith',
      }),
    ).toBe('John Smith');
  });

  it('omits middle name when empty string', () => {
    expect(
      formatFullName({ firstName: 'John', middleName: '', lastName: 'Smith' }),
    ).toBe('John Smith');
  });

  it('omits middle name when whitespace only', () => {
    expect(
      formatFullName({
        firstName: 'John',
        middleName: '   ',
        lastName: 'Smith',
      }),
    ).toBe('John Smith');
  });
});
