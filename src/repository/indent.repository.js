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

exports.findById = async (id) => {
	return Indent.findOne({
		where: { id },
		include: [
			{ association: 'department' },
			{ association: 'period' },
			{ association: 'remark' },
			{
				association: 'IndentItems',
				include: [
					{
						model: IndentSerialItem,
						as: 'serial_items',
					},
					{
						model: Budget,
						as: 'budget',
					},
				],
			},
		],
	});
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
