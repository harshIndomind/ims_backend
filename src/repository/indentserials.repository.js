const { IndentSerialItem } = require('../models/index');

exports.create = async (data, options = {}) => {
  return IndentSerialItem.create(data, options);
};

exports.update = async (data, options = {}) => {
  return IndentSerialItem.update(data, options);
}