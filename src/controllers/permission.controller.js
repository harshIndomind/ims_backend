const { PermissionService } = require('../services/index');
const catchAsync = require('../utils/catchAsync');
const { Permission, Menu, sequelize } = require('../models/index');
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

// Returns every active menu with its configured permission actions, grouped for the admin UI
exports.getPermissionsByMenu = catchAsync(async (req, res) => {
    const menus = await Menu.findAll({
        where: { isActive: 1 },
        attributes: ['id', 'menuName', 'slug', 'parentId'],
        include: [
            {
                model: Permission,
                as: 'permissions',
                attributes: ['id', 'action'],
                required: false,
            },
        ],
        order: [
            ['parentId', 'ASC'],
            ['menuName', 'ASC'],
        ],
    });

    res.status(200).json({
        status: true,
        message: 'Permissions by menu fetched successfully',
        data: menus,
    });
});

// Atomically replaces all permission actions for a single menu
exports.setMenuPermissions = catchAsync(async (req, res) => {
    const { menuId } = req.params;
    const { actions } = req.body;

    if (!Array.isArray(actions)) {
        return res.status(400).json({
            status: false,
            message: 'actions must be an array of strings',
        });
    }

    const uniqueActions = [...new Set(actions.map(String).filter(Boolean))];

    const t = await sequelize.transaction();
    try {
        await Permission.destroy({ where: { menu_id: Number(menuId) }, transaction: t });

        if (uniqueActions.length > 0) {
            await Permission.bulkCreate(
                uniqueActions.map((action) => ({
                    menu_id: Number(menuId),
                    action,
                })),
                { transaction: t },
            );
        }

        await t.commit();

        const updated = await Permission.findAll({
            where: { menu_id: Number(menuId) },
            attributes: ['id', 'action'],
        });

        res.status(200).json({
            status: true,
            message: 'Menu permissions updated successfully',
            data: updated,
        });
    } catch (error) {
        await t.rollback();
        throw error;
    }
});
