const { MasterAdditionalNotesTemplate } = require('../models/index');
const { Op } = require('sequelize');

exports.create = (data, options = {}) => {
	return MasterAdditionalNotesTemplate.create(data, options);
};

exports.findById = (id, options = {}) => {
	return MasterAdditionalNotesTemplate.findByPk(id, options);
};

exports.findOne = (options = {}) => {
	return MasterAdditionalNotesTemplate.findOne(options);
};

exports.findAll = (where = {}, options = {}) => {
	return MasterAdditionalNotesTemplate.findAndCountAll({
		where,
		...options,
	});
};

exports.update = (instance, data, options = {}) => {
	return instance.update(data, options);
};

exports.delete = (instance, options = {}) => {
	return instance.destroy(options);
};

exports.findAllForVendorAndType = (vendor_id, type, org_id) => {
	return MasterAdditionalNotesTemplate.findAll({
		where: {
			vendor_id,
			org_id,
			is_active: true,
			type: { [Op.in]: [type, 'BOTH'] },
		},
	});
};
exports.findDefaultForType = (type, org_id) => {
	return MasterAdditionalNotesTemplate.findAll({
		where: {
			vendor_id: null,
			org_id,
			is_active: true,
			type: { [Op.in]: [type, 'BOTH'] },
		},
	});
};