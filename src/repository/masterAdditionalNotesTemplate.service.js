const AppError = require('../utils/AppError');
const { StatusCodes } = require('http-status-codes');
const { additionalNoteTemplateRepo } = require('../repository/index');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

const VALID_TYPES = ['PO', 'WO', 'BOTH'];

function validateNotes(notes) {
	if (!Array.isArray(notes) || notes.length === 0) {
		return 'At least one title/detail row is required';
	}
	for (const row of notes) {
		if (!row.title || !row.title.trim()) {
			return 'Every row requires a title';
		}
	}
	return null;
}

exports.createTemplate = async (payload, orgId) => {
	const { type, vendor_id, vendor_name, notes } = payload;

	if (!type || !VALID_TYPES.includes(type)) {
		throw new AppError('A valid type (PO, WO or BOTH) is required', StatusCodes.BAD_REQUEST);
	}
	const notesError = validateNotes(notes);
	if (notesError) {
		throw new AppError(notesError, StatusCodes.BAD_REQUEST);
	}

	if (vendor_id) {
		const existing = await additionalNoteTemplateRepo.findOne({
			where: {
				org_id: orgId,
				vendor_id,
				type: { [Op.in]: [type, 'BOTH'] },
			},
		});
		if (existing) {
			logger.warn('Additional Notes Template already exists for vendor', { vendor_id, type });
			throw new AppError(
				'A template already exists for this vendor and type',
				StatusCodes.CONFLICT,
			);
		}
	}

	const template = await additionalNoteTemplateRepo.create({
		org_id: orgId,
		type,
		vendor_id: vendor_id || null,
		vendor_name: vendor_name || null,
		notes,
	});

	logger.info('Additional Notes Template created', { id: template.id });

	return template;
};

exports.updateTemplate = async (id, payload) => {
	const { type, vendor_id, vendor_name, notes } = payload;

	if (!type || !VALID_TYPES.includes(type)) {
		throw new AppError('A valid type (PO, WO or BOTH) is required', StatusCodes.BAD_REQUEST);
	}
	const notesError = validateNotes(notes);
	if (notesError) {
		throw new AppError(notesError, StatusCodes.BAD_REQUEST);
	}

	const template = await additionalNoteTemplateRepo.findById(id);
	if (!template) {
		logger.warn('Additional Notes Template not found for update', { id });
		throw new AppError('Additional Notes Template not found', StatusCodes.NOT_FOUND);
	}

	if (vendor_id) {
		const duplicate = await additionalNoteTemplateRepo.findOne({
			where: {
				org_id: template.org_id,
				vendor_id,
				type: { [Op.in]: [type, 'BOTH'] },
				id: { [Op.ne]: id },
			},
		});
		if (duplicate) {
			logger.warn('Additional Notes Template already exists for vendor', { vendor_id, type });
			throw new AppError(
				'A template already exists for this vendor and type',
				StatusCodes.CONFLICT,
			);
		}
	}

	await additionalNoteTemplateRepo.update(template, {
		type,
		vendor_id: vendor_id || null,
		vendor_name: vendor_name || null,
		notes,
	});

	logger.info('Additional Notes Template updated', { id });

	return template;
};

exports.getAllTemplates = async (req) => {
	const { limit, offset, search, type } = req.query;

	const where = {};
	if (search) {
		where.vendor_name = { [Op.like]: `%${search}%` };
	}
	if (type && VALID_TYPES.includes(type)) {
		where.type = type;
	}

	const filterOptions = { where, order: [['createdAt', 'DESC']] };
	if (limit) {
		filterOptions.limit = Number(limit);
		filterOptions.offset = Number(offset || 0);
	}

	return await additionalNoteTemplateRepo.findAll({}, filterOptions);
};

exports.getTemplateById = async (id) => {
	const template = await additionalNoteTemplateRepo.findById(id);

	if (!template) {
		logger.warn('Additional Notes Template not found', { id });
		throw new AppError('Additional Notes Template not found', StatusCodes.NOT_FOUND);
	}

	logger.info('Additional Notes Template fetched', { id });

	return template;
};

exports.deleteTemplate = async (id) => {
	const template = await additionalNoteTemplateRepo.findById(id);

	if (!template) {
		logger.warn('Additional Notes Template not found for delete', { id });
		throw new AppError('Additional Notes Template not found', StatusCodes.NOT_FOUND);
	}

	await additionalNoteTemplateRepo.delete(template);

	logger.info('Additional Notes Template deleted', { id });

	return true;
};

exports.getTemplateForVendor = async (vendor_id, type, orgId) => {
	if (!vendor_id || !type || !['PO', 'WO'].includes(type)) {
		throw new AppError('vendor_id and a valid type (PO or WO) are required', StatusCodes.BAD_REQUEST);
	}

	const matches = await additionalNoteTemplateRepo.findAllForVendorAndType(
		vendor_id,
		type,
		orgId,
	);

	if (!matches.length) {
		return null;
	}

	const exactMatch = matches.find((m) => m.type === type);
	return exactMatch || matches[0];
};