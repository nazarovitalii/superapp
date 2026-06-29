import { buildPropertyTitle } from './property-title';

describe('buildPropertyTitle', () => {
  it('беды + тип → «2BR Apartment»', () => {
    expect(buildPropertyTitle(2, 'Apartment')).toBe('2BR Apartment');
  });
  it('только тип (беды null) → «Villa»', () => {
    expect(buildPropertyTitle(null, 'Villa')).toBe('Villa');
  });
  it('0 беды (студия) + тип → «Studio Apartment»', () => {
    expect(buildPropertyTitle(0, 'Apartment')).toBe('Studio Apartment');
  });
  it('только беды (тип null) → «2BR»', () => {
    expect(buildPropertyTitle(2, null)).toBe('2BR');
  });
  it('ничего → пустая строка', () => {
    expect(buildPropertyTitle(null, null)).toBe('');
  });
});
