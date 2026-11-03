const { Op } = require('sequelize');
const { StatusCodes } = require('http-status-codes');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const projectRepository = require('../repository/project.repository');
const { Company, Issue } = require('../models/index');

const STATUSES = ['not_started', 'in_progress', 'completed'];
const FIELDS = ['company_id', 'name', 'description', 'status', 'start_date', 'end_date'];

const companyInclude = [{ model: Company, as: 'company', attributes: ['id', 'name'] }];

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

// A project must exist AND belong to the logged-in user's organization
const findOwnedOrThrow = async (id, org_id) => {
	const project = await projectRepository.findById(id, { include: companyInclude });
	if (!project || Number(project.org_id) !== Number(org_id)) {
		logger.warn('Project not found', { id });
		throw new AppError('Project not found', StatusCodes.NOT_FOUND);
	}
	return project;
};

// The chosen company must exist in the same organization
const assertCompanyOwned = async (company_id, org_id) => {
	const company = await Company.findByPk(company_id);
	if (!company || Number(company.org_id) !== Number(org_id)) {
		throw new AppError('Company not found', StatusCodes.BAD_REQUEST);
	}
};

// Dates are 'YYYY-MM-DD' strings, so plain comparison works
const assertDates = (start, end) => {
	if (start && end && end < start) {
		throw new AppError('End date cannot be before start date', StatusCodes.BAD_REQUEST);
	}
};

exports.createProject = async (req, payload) => {
	const { org_id, id: userId } = req.user;
	const data = pickFields(payload);

	await assertCompanyOwned(data.company_id, org_id);
	assertDates(data.start_date, data.end_date);

	const project = await projectRepository.create({
		...data,
		org_id,
		created_by: userId,
		updated_by: userId,
	});

	logger.info('Project created', { id: project.id, org_id });
	return project;
};

exports.updateProject = async (req, id, payload) => {
	const { org_id, id: userId } = req.user;
	const project = await findOwnedOrThrow(id, org_id);
	const data = pickFields(payload);

	if (data.company_id !== undefined && Number(data.company_id) !== Number(project.company_id)) {
		await assertCompanyOwned(data.company_id, org_id);
	}
	if (data.start_date === null) {
		throw new AppError('Start date is required', StatusCodes.BAD_REQUEST);
	}
	assertDates(
		data.start_date ?? project.start_date,
		data.end_date !== undefined ? data.end_date : project.end_date,
	);

	await projectRepository.update(project, { ...data, updated_by: userId });

	logger.info('Project updated', { id });
	return project;
};

exports.getAllProjects = async (req) => {
	const { org_id } = req.user;
	const { limit, offset, search, company_id, status } = req.query;

	const where = { org_id };
	if (search) where.name = { [Op.like]: `%${search}%` };
	if (company_id) where.company_id = Number(company_id);
	if (status && STATUSES.includes(status)) where.status = status;

	const options = { include: companyInclude, order: [['id', 'ASC']] };
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset) || 0;
	}

	return projectRepository.findAll(where, options);
};

exports.getProjectById = async (req, id) => {
	return findOwnedOrThrow(id, req.user.org_id);
};

exports.deleteProject = async (req, id) => {
	const project = await findOwnedOrThrow(id, req.user.org_id);

	const issueCount = await Issue.count({ where: { project_id: id } });
	if (issueCount > 0) {
		throw new AppError(
			'Cannot delete this project because it has issues. Delete those issues first.',
			StatusCodes.CONFLICT,
		);
	}

	await projectRepository.delete(project);
	logger.info('Project deleted', { id });
	return true;
};