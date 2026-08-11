import { groupBySuperset } from '../domain';

interface Item {
  id: string;
  order_index: number;
  superset_group_id: string | null;
}

describe('groupBySuperset', () => {
  it('puts ungrouped exercises each in their own single-item group', () => {
    const items: Item[] = [
      { id: 'a', order_index: 0, superset_group_id: null },
      { id: 'b', order_index: 1, superset_group_id: null },
    ];
    const groups = groupBySuperset(items);
    expect(groups).toHaveLength(2);
    expect(groups[0].items).toHaveLength(1);
    expect(groups[1].items).toHaveLength(1);
  });

  it('collapses consecutive items sharing a superset_group_id into one group, in order', () => {
    const items: Item[] = [
      { id: 'a', order_index: 0, superset_group_id: null },
      { id: 'b', order_index: 1, superset_group_id: 'g1' },
      { id: 'c', order_index: 2, superset_group_id: 'g1' },
      { id: 'd', order_index: 3, superset_group_id: null },
    ];
    const groups = groupBySuperset(items);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('sorts by order_index before grouping, regardless of input order', () => {
    const items: Item[] = [
      { id: 'c', order_index: 2, superset_group_id: 'g1' },
      { id: 'a', order_index: 0, superset_group_id: null },
      { id: 'b', order_index: 1, superset_group_id: 'g1' },
    ];
    const groups = groupBySuperset(items);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['a'], ['b', 'c']]);
  });
});
