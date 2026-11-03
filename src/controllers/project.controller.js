const catchAsync = require('../utils/catchAsync');
const { StatusCodes } = require('http-status-codes');
const projectService = require('../services/project.service');

exports.createProject = catchAsync(async (req, res) => {
	const data = await projectService.createProject(req, req.body);
	res.status(StatusCodes.CREATED).json({
		message: 'Project created successfully',
		data,
	});
});

exports.updateProject = catchAsync(async (req, res) => {
	const data = await projectService.updateProject(req, req.params.id, req.body);
	res.status(StatusCodes.OK).json({
		message: 'Project updated successfully',
		data,
	});
});

exports.getAllProjects = catchAsync(async (req, res) => {
	const data = await projectService.getAllProjects(req);
	res.status(StatusCodes.OK).json({ data });
});

exports.getProjectById = catchAsync(async (req, res) => {
	const data = await projectService.getProjectById(req, req.params.id);
	res.status(StatusCodes.OK).json({
		message: 'Project fetched successfully',
		data,
	});
});

exports.deleteProject = catchAsync(async (req, res) => {
	await projectService.deleteProject(req, req.params.id);
	res.status(StatusCodes.OK).json({
		message: 'Project deleted successfully',
	});
});