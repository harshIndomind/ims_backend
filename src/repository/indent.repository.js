const { Indent, IndentSerialItem, Budget } = require('../models/index');

exports.create = async (data, options = {}) => {
	return Indent.create(data, options);
};

exports.updateById = async (id, data, options = {}) => {
	return Indent.update(data, {
		where: { id },
		...options,
	});
};

exports.findById = async (options = {}) => {
	return Indent.findOne(options);
};

exports.findLastCreated = async () => {
	return Indent.findOne({
		order: [['createdAt', 'DESC']],
	});
};

exports.findAll = async (where = {}, options = {}) => {
	return Indent.findAndCountAll({
		where,
		...options,
	});
};

exports.findOne = async (query, options = {}) => {
	return Indent.findOne({ where: query, ...options });
};
