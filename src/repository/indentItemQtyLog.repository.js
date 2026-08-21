const { IndentItemQtyLog } = require('../models/index');

exports.create = async (data, options = {}) => {
	return IndentItemQtyLog.create(data, options);
};

exports.findByIndentIds = async (indentIds, options = {}) => {
	return IndentItemQtyLog.findAll({
		where: { indent_id: indentIds },
		order: [['indent_id', 'ASC'], ['createdAt', 'ASC']],
		...options,
	});
};
