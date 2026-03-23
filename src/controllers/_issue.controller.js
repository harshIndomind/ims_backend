const {
	Issue,
	Project,
	User,
	IssueHistory,
	UserProject,
	IssueAttachments,
	IssueLogs,
	sequelize,
	UserProjects,
	Company,
} = require('../models/index');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const { fn, col, Op, JSON } = require('sequelize');
const fs = require('fs/promises'); // ✅ Import promise-based fs
const path = require('path');
const {
	sendIssueCreatedMail,
	sendIssueApprovedMail,
	sendIssueStatusChangedMail,
} = require('../utils/mailer');
const eventEmitter = require('../utils/emitter');

const MAX_FILE_UPLOAD_SIZE = 100000000;

exports.createIssue = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();
	try {
		const { title, description, status, priority, projectId, assigneeId } =
			req.body;

		const reporterId = req.user.id;
		const attachments = req.files;

		// Create issue
		const issue = await Issue.create(
			{
				title,
				description,
				priority,
				status: req.user.role === 'User' ? 'open' : status || 'open',
				projectId,
				reporterId,
				assigneeId,
			},
			{ transaction: t }
		);

		// Generate log
		await generateIssueLog(issue.id, reporterId, status, false, '', t);

		// Save attachments
		if (attachments?.length) {
			const attachmentData = attachments.map((file) => ({
				issueId: issue.id,
				filename: file.filename,
				fileType: file.mimetype.split('/')[1],
				path: `/uploads/issues/${file.filename}`,
			}));
			await IssueAttachments.bulkCreate(attachmentData, { transaction: t });
		}

		// Get user details for email
		const [assignTo, createdBy] = await Promise.all([
			getUserDetailsById(assigneeId),
			getUserDetailsById(reporterId),
		]);

		const projectHeads = await Project.findByPk(projectId, {
			include: [
				{
					model: User,
					as: 'users',
					attributes: ['name', 'email'],
					where: { roleId: 2 },
					through: {
						attributes: [],
					},
				},
			],
		});

		if (projectHeads) {
			const heads = projectHeads.toJSON();

			for (const ph of heads.users) {
				console.log('ph.email ', ph.email);

				if (!ph.email) {
					console.warn('Skipping user with no email:', ph);
					continue;
				}

				const projectHeadpayload = {
					subject:
						'New Issue Created 🚀 Please Take Necessary Action to Approve the Issue',
					body: {
						name: ph.name,
						assignTo: assignTo.name,
						createdBy: createdBy.name,
						issueTitle: title,
						issueDescription: description,
						issuePriority: priority.toUpperCase(),
						issueStatus: getStatusValue(issue.status),
					},
				};

				await sendIssueCreatedMail(ph.email, projectHeadpayload);
			}
		}

		if (assignTo && createdBy) {
			const payload = {
				subject: 'New Issue Assigned 🚀',
				body: {
					name: assignTo.name,
					assignTo: assignTo.name,
					createdBy: createdBy.name,
					issueTitle: title,
					issueDescription: description,
					issuePriority: priority.toUpperCase(),
					issueStatus: getStatusValue(issue.status),
				},
			};

			await sendIssueCreatedMail(assignTo.email, payload);
		}

		await t.commit();

		eventEmitter.emit('issueCreated');

		res.status(201).json({
			status: true,
			message: 'Issue created successfully',
			data: issue,
		});
	} catch (error) {
		await t.rollback();
		console.error('Error in createIssue:', error);
		res.status(500).json({
			status: false,
			message: 'Failed to create issue',
			error: error.message,
		});
	}
});

exports.getIssue = catchAsync(async (req, res) => {
	const { id } = req.params;
	const issue = await Issue.findOne({
		where: { id },
		include: [
			{
				model: IssueAttachments,
				as: 'attachments',
				attributes: ['id', 'filename', 'path'],
			},
			{
				model: Project,
				as: 'project',
				attributes: ['id', 'name'],
				include: {
					model: Company,
					attributes: ['id', 'name'],
				},
			},
		],
	});
	res.status(200).json({
		status: true,
		message: 'Issue fetched successfully',
		data: issue,
	});
});

exports.getAllIssues = catchAsync(async (req, res) => {
	const user_id = req.user.id;
	const user_role = req.user.role;
	const limit = parseInt(req.query.limit) || 10;
	const offset = parseInt(req.query.offset) || 0;
	console.log('{limit, offset} ', { limit, offset });

	let whereClause = {};

	if (user_role === 'Project Tech Head') {
		// Get all project IDs assigned to this tech head
		const user = await User.findByPk(user_id, {
			include: {
				model: UserProject,
				as: 'UserProjects',
				include: {
					model: Project,
					attributes: ['id'],
				},
			},
		});

		const projectIds = user.UserProjects.map((up) => up.Project?.id).filter(
			Boolean
		);

		whereClause.projectId = projectIds.length > 0 ? projectIds : null;
	} else if (user_role === 'User') {
		whereClause.reporterId = user_id;
	} else if (user_role === 'Support Engineer') {
		whereClause.assigneeId = user_id;
	} // Admin has empty whereClause (sees all)

	// Fetch issues based on role logic
	const issues = await Issue.findAndCountAll({
		where: whereClause,
		include: [
			{ model: User, as: 'reporter', attributes: ['name'] },
			{ model: User, as: 'assignee', attributes: ['name'] },
			{ model: Project, as: 'project', attributes: ['name'] },
		],
		offset,
		limit,
		order: [['id', 'DESC']],
	});

	console.log('issues ', issues);

	res.status(200).json({
		status: true,
		message: 'Issues fetched successfully',
		data: issues,
	});
});

exports.updateIssue = catchAsync(async (req, res) => {
	const t = await sequelize.transaction();

	try {
		const { id } = req.params;
		const {
			title,
			description,
			status,
			priority,
			projectId,
			assigneeId,
			comment,
			isApproved,
		} = req.body;

		const userId = req.user.id;

		const attachments = req.files;

		const issue = await Issue.findByPk(id);
		if (!issue) return res.status(404).send('Issue not found');

		if (req.user.role === 'Project Tech Head') {
			issue.isApproved = isApproved === 'true';

			const [assignTo, approvedBy] = await Promise.all([
				getUserDetailsById(assigneeId),
				getUserDetailsById(req.user.id),
			]);

			if (assignTo) {
				const payload = {
					subject: `Issue ${issue.isApproved ? 'Approved ✅' : 'Rejected ❌'}`,
					body: {
						name: assignTo.name,
						approvedBy: approvedBy.name,
						action: issue.isApproved ? 'Approved' : 'Rejected',
						message: issue.isApproved
							? 'You can now begin working on it to resolve the problem.'
							: 'The issue was not approved. You may want to follow up with the project lead.',
					},
				};

				await sendIssueApprovedMail(assignTo.email, payload);
			}
		}

		await generateIssueLog(issue.id, userId, status, issue.isApproved, comment);

		if (attachments?.length > 0) {
			const exceedSizeData = attachments
				.filter((file) => file.size > MAX_FILE_UPLOAD_SIZE)
				.map(
					(file) =>
						`${file.filename} | Size: ${(file.size / 1000000).toFixed(2)} MB`
				);

			if (exceedSizeData.length > 0) {
				throw new AppError(
					`File size exceed: ${exceedSizeData.toString()}`,
					400
				);
			}

			const attachmentData = attachments.map((file) => ({
				issueId: issue.id,
				filename: file.filename,
				fileType: file.mimetype.split('/')[1],
				path: `/uploads/issues/${file.filename}`,
			}));
			await IssueAttachments.bulkCreate(attachmentData, { transaction: t });
		}

		const oldStatus = issue.status;
		const newStatus = status;

		if (issue.status !== status) {
			await IssueHistory.create({
				issueId: issue.id,
				changedById: userId,
				oldStatus: issue.status,
				newStatus: status,
				changedAt: new Date(),
				comment,
			});

			issue.status = status;
		}
		await issue.save();

		if (oldStatus !== status) {
			const [reporter] = await Promise.all([
				// getUserDetailsById(assigneeId),
				getUserDetailsById(issue.reporterId),
			]);

			if (reporter) {
				const payload = {
					subject: `Issue Status Changed ✍️`,
					body: {
						name: '',
						status: status,
						comment,
					},
				};

				// const assigneeMailPayload = {...payload};
				// assigneeMailPayload.body.name = assignee.name;

				const reporterMailPayload = { ...payload };
				reporterMailPayload.body.name = reporter.name;

				await Promise.all([
					// sendIssueStatusChangedMail(assignee.email, assigneeMailPayload),
					sendIssueStatusChangedMail(reporter.email, reporterMailPayload),
				]);
			}

			const projectHeads = await Project.findByPk(projectId, {
				include: [
					{
						model: User,
						as: 'users',
						attributes: ['name', 'email'],
						where: { roleId: 2 },
						through: {
							attributes: [],
						},
					},
				],
			});

			if (projectHeads) {
				const heads = projectHeads.toJSON();

				for (const ph of heads.users) {
					console.log('ph.email ', ph.email);

					if (!ph.email) {
						console.warn('Skipping user with no email:', ph);
						continue;
					}

					const projectHeadpayload = {
						subject: `Issue Status Changed ✍️`,
						body: {
							name: ph.name,
							status: status,
							comment,
						},
					};

					await sendIssueStatusChangedMail(ph.email, projectHeadpayload);
				}
			}
		}

		await t.commit();

		res.status(200).json({
			status: true,
			message: 'Issues updated successfully',
			data: null,
		});
	} catch (error) {
		await t.rollback();
		res.status(error.statusCode ?? 500).json({
			status: false,
			message: `${error.message ?? `Failed to update issue`}`,
			error: error.message,
		});
	}
});

exports.deleteIssue = catchAsync(async (req, res) => {
	const { id } = req.params;

	// Get all attachments (not just one)
	const attachments = await IssueAttachments.findAll({
		where: { issueId: id },
	});

	// Delete the issue
	await Issue.destroy({ where: { id } });

	// Delete each attachment file
	for (const attachment of attachments) {
		const filePath = path.join('src', attachment.path); // ✅ build path safely

		try {
			await fs.access(filePath); // Check if file exists
			await fs.unlink(filePath);
			console.log(`Deleted: ${filePath}`);
		} catch (err) {
			throw new AppError(`Failed to delete: ${filePath}, ${err.message}`);
		}
	}

	res.status(200).json({
		status: true,
		message: 'Issue and attachments deleted successfully',
		data: null,
	});
});

exports.getIssuesCounts = catchAsync(async (req, res) => {
	const user_id = req.user.id;
	const user_role = req.user.role;

	let whereClause = {};

	if (user_role === 'Project Tech Head') {
		// Get project IDs assigned to this user
		const user = await User.findByPk(user_id, {
			include: {
				model: UserProject,
				as: 'UserProjects',
				include: {
					model: Project,
					attributes: ['id'],
				},
			},
		});

		const projectIds = user.UserProjects.map((up) => up.Project?.id).filter(
			Boolean
		);
		whereClause.projectId = projectIds.length > 0 ? projectIds : null;
	} else if (user_role === 'User') {
		whereClause.reporterId = user_id;
	} else if (user_role === 'Support Engineer') {
		whereClause.assigneeId = user_id;
	}
	// Admin gets no filter

	const issuesCounts = await Issue.findAll({
		where: whereClause,
		attributes: ['status', [fn('COUNT', col('status')), 'count']],
		group: ['status'],
		raw: true,
	});

	// Convert to map for easier lookup
	const countsMap = issuesCounts.reduce((acc, item) => {
		acc[item.status] = parseInt(item.count, 10);
		return acc;
	}, {});

	// Ensure all statuses are present
	const allStatuses = ['open', 'in_progress', 'resolved', 'closed'];
	const result = allStatuses.reduce((acc, status) => {
		acc[status] = countsMap[status] || 0;
		return acc;
	}, {});

	console.log('result', result);

	res.status(200).json({
		status: true,
		message: 'Issues counts fetched successfully',
		data: result,
	});
});

exports.getIssueHistory = catchAsync(async (req, res) => {
	const { id } = req.params;

	const history = await IssueLogs.findAll({
		where: { issueId: id },
		include: [{ model: User, attributes: ['id', 'name'] }],
		order: [['changedAt', 'ASC']],
	});

	res.status(200).json({
		status: true,
		message: 'Issues history fetched successfully',
		data: history,
	});
});

async function generateIssueLog(
	issueId,
	changedBy,
	status,
	isApproved = false,
	comment = '',
	transaction
) {
	return await IssueLogs.create(
		{
			issueId,
			changedById: changedBy,
			status,
			changedAt: new Date(),
			isApproved,
			comment,
		},
		{ transaction }
	);
}

async function getUserDetailsById(userId) {
	return await User.findByPk(userId, {
		attributes: ['id', 'name', 'email', 'roleId'],
	});
}

function getStatusValue(status) {
	const statusMap = {
		open: 'Open',
		in_progress: 'In-Progress',
		resolved: 'Resolved',
		closed: 'Closed',
	};

	return statusMap[status];
}
