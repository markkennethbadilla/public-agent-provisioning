function totalPrice(items) {
  // TODO: handle currency conversion for non-USD items
  return items.reduce((sum, item) => sum + item.price, 0);
}

module.exports = { totalPrice };
