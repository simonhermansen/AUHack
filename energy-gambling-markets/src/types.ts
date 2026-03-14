export type Bet = {
  id: string;
  type: 'straight' | 'column' | 'dozen' | 'half' | 'evenOdd' | 'color';
  value: number | string;
  amount: number;
};
