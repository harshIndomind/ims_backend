const express = require('express');
const router = express.Router();
const UserController = require('../../controllers/user.controller');
const UserVisibilityController = require('../../controllers/user-visibility.controller');
const checkRole = require('../../middlewares/checkRole');
const verifyToken = require('../../middlewares/verifyToken');
const { uploadTo } = require('../../middlewares/multer');
const checkPermission = require('../../middlewares/checkPermission');
const checkSyncHrms = require('../../middlewares/checkSyncHrms');
const AppError = require('../../utils/AppError');

// Only super_admin and org_admin can manage visibility mappings.
const requireAdminRole = (req, res, next) => {
	const ADMIN_ROLES = ['super_admin', 'org_admin'];
	if (!req.user?.roles?.some((r) => ADMIN_ROLES.includes(r))) {
		return next(new AppError('Access denied', 403));
	}
	next();
};

router.post('/forgot-password', UserController.sendForgotPasswordMail);
router.post('/reset-password', UserController.resetPassword);

router.use(verifyToken);

router.get('/', checkPermission('users', 'view'), UserController.getAllUsers);

router.post('/', checkSyncHrms, checkPermission('users', 'create'), UserController.createUser);

router.get(
	'/profile',
	checkPermission('profile', 'view'),
	UserController.getUserProfileById,
);
router.put(
	'/profile',
	checkPermission('profile', 'edit'),
	uploadTo('uploads/profile').fields([
		{ name: 'image', maxCount: 1 },
		{ name: 'logo', maxCount: 1 },
	]),
	UserController.updateUserProfile,
);
router.put('/:id', checkPermission('users', 'edit'), UserController.updateUser);
router.patch('/:id/deactivate', checkPermission('users', 'edit'), UserController.deactivateUser);
router.patch('/:id/activate', checkPermission('users', 'edit'), UserController.activateUser);
router.delete(
	'/:id',
	checkPermission('users', 'delete'),
	UserController.destroy,
);

router.get(
	'/:id',
	checkPermission(['users', 'profile'], 'view'),
	UserController.getUserById,
);

// ── User Data Visibility Mapping (admin-only) ───────────────────────────────
router.get('/:id/visibility', requireAdminRole, UserVisibilityController.getVisibility);
router.post('/:id/visibility', requireAdminRole, UserVisibilityController.saveVisibility);

module.exports = router;
