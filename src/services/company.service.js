const { Op } = require('sequelize');
const { StatusCodes } = require('http-status-codes');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const companyRepository = require('../repository/company.repository');
const { Project } = require('../models/index');

const FIELDS = ['name', 'description', 'address', 'contact_no', 'alt_contact_no'];

// Only accept known fields; turn empty strings into null
const pickFields = (payload = {}) => {
	const out = {};
	for (const key of FIELDS) {
		if (payload[key] !== undefined) {
			out[key] = payload[key] === '' ? null : payload[key];
		}
	}
	return out;
};

// A company must exist AND belong to the logged-in user's organization
const findOwnedOrThrow = async (id, org_id) => {
	const company = await companyRepository.findById(id);
	if (!company || Number(company.org_id) !== Number(org_id)) {
		logger.warn('Company not found', { id });
		throw new AppError('Company not found', StatusCodes.NOT_FOUND);
	}
	return company;
};

exports.createCompany = async (req, payload) => {
	const { org_id, id: userId } = req.user;

	const company = await companyRepository.create({
		...pickFields(payload),
		org_id,
		created_by: userId,
		updated_by: userId,
	});

	logger.info('Company created', { id: company.id, org_id });
	return company;
};

exports.updateCompany = async (req, id, payload) => {
	const company = await findOwnedOrThrow(id, req.user.org_id);

	await companyRepository.update(company, {
		...pickFields(payload),
		updated_by: req.user.id,
	});

	logger.info('Company updated', { id });
	return company;
};

exports.getAllCompanies = async (req) => {
	const { org_id } = req.user;
	const { limit, offset, search } = req.query;

	const where = { org_id };
	if (search) where.name = { [Op.like]: `%${search}%` };

	const options = { order: [['id', 'ASC']] };
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset) || 0;
	}

	return companyRepository.findAll(where, options);
};

exports.getCompanyById = async (req, id) => {
	return findOwnedOrThrow(id, req.user.org_id);
};

exports.deleteCompany = async (req, id) => {
	const company = await findOwnedOrThrow(id, req.user.org_id);

	const projectCount = await Project.count({ where: { company_id: id } });
	if (projectCount > 0) {
		throw new AppError(
			'Cannot delete this company because it has projects. Delete those projects first.',
			StatusCodes.CONFLICT,
		);
	}

	await companyRepository.delete(company);
	logger.info('Company deleted', { id });
	return true;
};