const { Op, fn, col } = require('sequelize');
const { StatusCodes } = require('http-status-codes');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const issueRepository = require('../repository/issue.repository');
const { Project, User, Issue } = require('../models/index');

const PRIORITIES = ['low', 'medium', 'high'];
const ISSUE_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const FIELDS = ['project_id', 'assignee_id', 'title', 'description', 'priority', 'issue_status'];

const includes = [
	{ model: Project, as: 'project', attributes: ['id', 'name'] },
	{ model: User, as: 'reporter', attributes: ['id', 'name'] },
	{ model: User, as: 'assignee', attributes: ['id', 'name'] },
];

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

// An issue must exist AND belong to the logged-in user's organization
const findOwnedOrThrow = async (id, org_id) => {
	const issue = await issueRepository.findById(id, { include: includes });
	if (!issue || Number(issue.org_id) !== Number(org_id)) {
		logger.warn('Issue not found', { id });
		throw new AppError('Issue not found', StatusCodes.NOT_FOUND);
	}
	return issue;
};

const assertProjectOwned = async (project_id, org_id) => {
	const project = await Project.findByPk(project_id);
	if (!project || Number(project.org_id) !== Number(org_id)) {
		throw new AppError('Project not found', StatusCodes.BAD_REQUEST);
	}
};

const assertAssigneeValid = async (assignee_id, org_id) => {
	const user = await User.findOne({
		where: { id: assignee_id, org_id, is_active: 1 },
		attributes: ['id'],
	});
	if (!user) {
		throw new AppError('Selected user not found', StatusCodes.BAD_REQUEST);
	}
};

exports.createIssue = async (req, payload) => {
	const { org_id, id: userId } = req.user;
	const data = pickFields(payload);

	await assertProjectOwned(data.project_id, org_id);
	await assertAssigneeValid(data.assignee_id, org_id);

	const issue = await issueRepository.create({
		...data,
		org_id,
		reporter_id: userId,
		updated_by: userId,
	});

	logger.info('Issue created', { id: issue.id, org_id });
	return issue;
};

exports.updateIssue = async (req, id, payload) => {
	const { org_id, id: userId } = req.user;
	const issue = await findOwnedOrThrow(id, org_id);
	const data = pickFields(payload);

	if (data.project_id !== undefined && Number(data.project_id) !== Number(issue.project_id)) {
		await assertProjectOwned(data.project_id, org_id);
	}
	if (data.assignee_id !== undefined && Number(data.assignee_id) !== Number(issue.assignee_id)) {
		await assertAssigneeValid(data.assignee_id, org_id);
	}

	await issueRepository.update(issue, { ...data, updated_by: userId });

	logger.info('Issue updated', { id });
	return findOwnedOrThrow(id, org_id);
};

exports.getAllIssues = async (req) => {
	const { org_id } = req.user;
	const { limit, offset, search, project_id, assignee_id, issue_status, priority } = req.query;

	const where = { org_id };
	if (search) where.title = { [Op.like]: `%${search}%` };
	if (project_id) where.project_id = Number(project_id);
	if (assignee_id) where.assignee_id = Number(assignee_id);
	if (issue_status && ISSUE_STATUSES.includes(issue_status)) where.issue_status = issue_status;
	if (priority && PRIORITIES.includes(priority)) where.priority = priority;

	const options = { include: includes, order: [['id', 'DESC']] };
	if (limit) {
		options.limit = Number(limit);
		options.offset = Number(offset) || 0;
	}

	return issueRepository.findAll(where, options);
};

exports.getIssueById = async (req, id) => {
	return findOwnedOrThrow(id, req.user.org_id);
};

// Active users of the same organization, for the "Tech Support Users" dropdown
exports.getAssignees = async (req) => {
	return User.findAll({
		where: { org_id: req.user.org_id, is_active: 1 },
		attributes: ['id', 'name', 'email'],
		order: [['name', 'ASC']],
	});
};

// Counts per status, for the dashboard cards
exports.getSummary = async (req) => {
	const rows = await Issue.findAll({
		where: { org_id: req.user.org_id },
		attributes: ['issue_status', [fn('COUNT', col('id')), 'count']],
		group: ['issue_status'],
		raw: true,
	});

	const summary = { open: 0, in_progress: 0, resolved: 0, closed: 0, total: 0 };
	for (const r of rows) {
		const n = Number(r.count);
		summary[r.issue_status] = n;
		summary.total += n;
	}
	return summary;
};

exports.deleteIssue = async (req, id) => {
	const issue = await findOwnedOrThrow(id, req.user.org_id);
	await issueRepository.delete(issue);
	logger.info('Issue deleted', { id });
	return true;
};