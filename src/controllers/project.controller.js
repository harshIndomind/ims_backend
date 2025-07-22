const { Project, Company } = require('../models/index');
const catchAsync = require('../utils/catchAsync');

exports.createProject = catchAsync(async (req, res) => {
	try {
		const { company_id, name, description, startDate, endDate, status } =
			req.body;
		const createdBy = req.user.id;

		const project = await Project.create({
			company_id,
			name,
			description,
			status,
			startDate: new Date(startDate), // or convert explicitly with date-fns if needed
			endDate: endDate ? new Date(endDate) : null,
			createdBy,
		});

		res.status(201).json(project);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

exports.getAllProjects = catchAsync(async (req, res) => {
	const projects = await Project.findAll({
		include: [
			{
				model: Company,
				attributes: ['id', 'name'],
			},
		],
	});
	res.json(projects);
});

exports.getProject = catchAsync(async (req, res) => {
	const { id } = req.params;
	const project = await Project.findOne({ where: { id } });
	res.json(project);
});

exports.updateProject = catchAsync(async (req, res) => {
	try {
		const { id } = req.params;
		const { company_id, name, description, startDate, endDate, status } =
			req.body;
		const createdBy = req.user.id;

		// Optional: Validate input fields if needed
		if (startDate && endDate) {
			const start = new Date(startDate);
			const end = new Date(endDate);

			if (end < start) {
				return res.status(400).json({
					message: 'End date cannot be before start date',
				});
			}
		}

		const [updatedCount] = await Project.update(
			{
				company_id,
				name,
				status,
				description,
				startDate: new Date(startDate), // or convert explicitly with date-fns if needed
				endDate: endDate ? new Date(endDate) : null,
				createdBy,
			},
			{
				where: { id },
			}
		);

		if (updatedCount === 0) {
			return res
				.status(404)
				.json({ message: 'Project not found or no changes' });
		}

		res.json({ message: 'Project updated successfully' });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

exports.deleteProject = catchAsync(async (req, res) => {
	const { id } = req.params;

	await Project.destroy({ where: { id } });
	res.json({ message: 'Project deleted' });
});

exports.getProjectByCompanyId = catchAsync(async (req, res) => {
	const { id } = req.params;

	const project = await Project.findAll({ where: { company_id: id } });
	res.json(project);
});
