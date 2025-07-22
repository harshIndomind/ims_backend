const { PermissionService } = require('../services/index');
const catchAsync = require('../utils/catchAsync');
const permissionService = new PermissionService();

exports.create = catchAsync(async (req, res) => {
    const permission = await permissionService.create(req.body);

    res.status(201).json({
        status: true,
        message: 'Permission created successfully',
        data: permission,
    });
});

exports.update = catchAsync(async (req, res) => {
    const { id } = req.params;
    const permission = await permissionService.update(id, req.body);

    let message = (permission == 0) ? 'Nothing to update.' : 'Permission updated successfully'; 
    res.status(201).json({
        status: true,
        message: message,
        data: permission,
    });
});

exports.destory = catchAsync(async (req, res) => {
    const { id } = req.params;

    const permission = await permissionService.delete(id);

    res.status(201).json({
        status: true,
        message: 'Permission deleted successfully',
        data: permission,
    });
});

exports.getAllPermissions = catchAsync(async (req, res) => {
    const permissions = await permissionService.getAllPermissions();

    res.status(201).json({
        status: true,
        message: 'Permissions fetched successfully',
        data: permissions,
    });
});

exports.getPermissionById = catchAsync(async (req, res) => {
    const { id } = req.params;

    const permission = await permissionService.getPermissionById(id);
    let message = (permission) ? 'A Permission fetched successfully' : 'Permission not found';
    res.status(201).json({
        status: true,
        message: message,
        data: permission,
    });
});
