const { OrganizationBankDetails } = require('../models/index');

exports.create = (data, options) => {
	return OrganizationBankDetails.create(data, options);
};

exports.bulkCreate = (data, options) => {
	return OrganizationBankDetails.bulkCreate(data, options);
};


exports.findById = (id, options = {}) => {
	return OrganizationBankDetails.findByPk(id, options);
};

exports.findAll = (where = {}, options = {}) => {	
	return OrganizationBankDetails.findAndCountAll({
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