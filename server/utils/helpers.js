const paginate = (query, page = 1, limit = 20) => {
  const offset = (page - 1) * limit;
  return `${query} LIMIT ${limit} OFFSET ${offset}`;
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);

module.exports = { paginate, formatCurrency };
