const { IndentItem } = require('../models/index');

exports.create = async (data, options = {}) => {
  return IndentItem.create(data, options);
};

exports.bulkCreate = async (data, options = {}) => {
  return IndentItem.bulkCreate(data, options);
};

exports.findOne = async (query, options = {}) => {
  return IndentItem.findOne({ where: query, ...options });
};

exports.increment = async(query = {}, where={}) => {
  return IndentItem.increment(query, where);
}