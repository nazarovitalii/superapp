import { resolveFeedAddress } from './feed-address.util';
import { PropertyFeedItem } from '../types/database';

type AddrInput = Pick<
  PropertyFeedItem,
  'location_name' | 'community_name' | 'public_location_name' | 'public_community_name'
>;

describe('resolveFeedAddress', () => {
  it('showPublic=false → полный адрес: location_name + community', () => {
    const p: AddrInput = {
      location_name: 'Marina Tower 5',
      community_name: 'Dubai Marina',
      public_location_name: 'Dubai Marina',
      public_community_name: 'Dubai Marina',
    };
    const result = resolveFeedAddress(p, false);
    expect(result.leaf).toBe('Marina Tower 5');
    expect(result.community).toBe('Dubai Marina');
  });

  it('showPublic=true → публичный адрес: public_location_name + public_community_name', () => {
    const p: AddrInput = {
      location_name: 'Marina Tower 5',
      community_name: 'Dubai Marina',
      public_location_name: 'Dubai Marina',
      public_community_name: 'Dubai',
    };
    const result = resolveFeedAddress(p, true);
    expect(result.leaf).toBe('Dubai Marina');
    expect(result.community).toBe('Dubai');
  });

  it('showPublic=true, public_location_name==null → fallback на community_name, НЕ location_name (V-10)', () => {
    const p: AddrInput = {
      location_name: 'JBR Tower',
      community_name: 'JBR',
      public_location_name: null,
      public_community_name: null,
    };
    const result = resolveFeedAddress(p, true);
    // location_name — приватный полный адрес, в публичном режиме показывать нельзя
    expect(result.leaf).not.toBe('JBR Tower');
    // При отсутствии public_location_name берём community_name как наименее точный fallback
    expect(result.leaf).toBe('JBR');
    expect(result.community).toBeNull();
  });

  it('community совпадает с leaf → community=null (не дублировать)', () => {
    const p: AddrInput = {
      location_name: 'Dubai Marina',
      community_name: 'Dubai Marina',
      public_location_name: null,
      public_community_name: null,
    };
    const result = resolveFeedAddress(p, false);
    expect(result.leaf).toBe('Dubai Marina');
    expect(result.community).toBeNull();
  });

  it('все поля null → leaf=«—», community=null', () => {
    const p: AddrInput = {
      location_name: null,
      community_name: null,
      public_location_name: null,
      public_community_name: null,
    };
    const result = resolveFeedAddress(p, true);
    expect(result.leaf).toBe('—');
    expect(result.community).toBeNull();
  });
});
