const { PaymentRequisitionDeduction } = require('../models/index');

exports.bulkCreate = async (rows, options = {}) => {
	return PaymentRequisitionDeduction.bulkCreate(rows, { returning: true, ...options });
};

exports.findByRequisitionId = async (payment_requisition_id, options = {}) => {
	return PaymentRequisitionDeduction.findAll({
		where: { payment_requisition_id },
		order: [['id', 'ASC']],
		...options,
	});
};

exports.deleteByRequisitionId = async (payment_requisition_id, options = {}) => {
	return PaymentRequisitionDeduction.destroy({ where: { payment_requisition_id }, ...options });
};

exports.deleteById = async (id, options = {}) => {
	return PaymentRequisitionDeduction.destroy({ where: { id }, ...options });
};

exports.findById = async (id, options = {}) => {
	return PaymentRequisitionDeduction.findOne({ where: { id }, ...options });
};

exports.updateById = async (id, data, options = {}) => {
	return PaymentRequisitionDeduction.update(data, { where: { id }, ...options });
};
