const paginate = (query: string, page = 1, limit = 20): string => {
  const offset = (page - 1) * limit;
  return `${query} LIMIT ${limit} OFFSET ${offset}`;
};

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);

export { paginate, formatCurrency };
