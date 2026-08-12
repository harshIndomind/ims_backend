const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { Op } = require('sequelize');
const { sequelize } = require('../models/index');
const { QcTemplate, QcTemplateItem } = require('../models/index');
const { qcTemplateRepository } = require('../repository/index');

exports.createTemplate = async (req, payload) => {
	const { org_id } = req.user;
	const { name, document_type, product_category_id, is_default, items = [] } = payload;

	if (!Array.isArray(items) || items.length === 0) {
		throw new AppError('A QC template must include at least one checklist item', StatusCodes.BAD_REQUEST);
	}

	const transaction = await sequelize.transaction();
	try {
		const template = await QcTemplate.create(
			{
				org_id: org_id || null,
				name,
				document_type: document_type || 'both',
				product_category_id: product_category_id || null,
				is_default: Boolean(is_default),
			},
			{ transaction },
		);

		await QcTemplateItem.bulkCreate(
			items.map((item, index) => ({
				qc_template_id: template.id,
				sequence: item.sequence ?? index,
				parameter_name: item.parameter_name,
				parameter_type: item.parameter_type,
				expected_value: item.expected_value || null,
				tolerance_min: item.tolerance_min ?? null,
				tolerance_max: item.tolerance_max ?? null,
				unit: item.unit || null,
				is_required: item.is_required ?? true,
			})),
			{ transaction },
		);

		await transaction.commit();
		return QcTemplate.findByPk(template.id, { include: [{ model: QcTemplateItem, as: 'items' }] });
	} catch (error) {
		await transaction.rollback();
		throw error;
	}
};

exports.getAllTemplates = async (req) => {
	const { org_id } = req.user;
	const { document_type, is_active } = req.query;

	const where = { org_id: { [Op.or]: [org_id, null] } };
	if (document_type) where.document_type = { [Op.in]: [document_type, 'both'] };
	if (is_active !== undefined) where.is_active = is_active === 'true';

	return QcTemplate.findAndCountAll({
		where,
		include: [{ model: QcTemplateItem, as: 'items' }],
		order: [['createdAt', 'DESC']],
	});
};

exports.getTemplateById = async (req, id) => {
	const template = await QcTemplate.findByPk(id, { include: [{ model: QcTemplateItem, as: 'items' }] });
	if (!template) throw new AppError('QC template not found', StatusCodes.NOT_FOUND);
	return template;
};

exports.deactivateTemplate = async (req, id) => {
	const template = await qcTemplateRepository.findById(id);
	if (!template) throw new AppError('QC template not found', StatusCodes.NOT_FOUND);
	await template.update({ is_active: false });
	return template;
};
