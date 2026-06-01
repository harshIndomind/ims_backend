const { PaymentRequisition, User, MasterTermsCondition } = require('../models/index');

const include = [
	{
		model: User,
		as: 'fedBy',
		attributes: ['id', 'name', 'email'],
	},
	{
		model: User,
		as: 'authorizedBy',
		attributes: ['id', 'name', 'email'],
	},
	{
		model: MasterTermsCondition,
		as: 'terms',
		attributes: ['id', 'org_id', 'terms_type'],
	},
];

exports.create = async (data, options = {}) => {
	return PaymentRequisition.create(data, options);
};

exports.updateById = async (id, data, options = {}) => {
	return PaymentRequisition.update(data, {
		where: { id },
		...options,
	});
};

exports.findById = async (id, options = {}) => {
	return PaymentRequisition.findOne({
		where: { id },
		include,
		...options,
	});
};

exports.findAll = async (where = {}, options = {}) => {
	return PaymentRequisition.findAndCountAll({
		where,
		include,
		order: [['createdAt', 'DESC']],
		...options,
	});
};

exports.findLastCreated = async (where = {}) => {
	return PaymentRequisition.findOne({
		where,
		order: [['createdAt', 'DESC']],
	});
};

exports.deleteById = async (id, options = {}) => {
	return PaymentRequisition.destroy({
		where: { id },
		...options,
	});
};
