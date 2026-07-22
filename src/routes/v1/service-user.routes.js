const express = require('express');
const router = express.Router();
const serviceUserController = require('../../controllers/service-user.controller');
const verifyToken = require('../../middlewares/verifyToken');
const { uploadTo } = require('../../middlewares/multer');
const verifyServiceToken = require('../../middlewares/verifyServiceToken');

router.post('/forgot-password', serviceUserController.sendForgotPasswordMail);
router.post('/reset-password', serviceUserController.resetPassword);

// router.use(verifyToken);

router.post('/', verifyServiceToken, serviceUserController.create);
// router.get(
// 	'/profile',
// 	serviceUserController.getUserProfileById
// );
router.put(
	'/profile/:swayamm_user_id',
	verifyServiceToken,
	uploadTo('uploads/profile').fields([
		{ name: 'image', maxCount: 1 },
		{ name: 'logo', maxCount: 1 },
	]),
	serviceUserController.updateUserProfile
);
router.put('/:id', serviceUserController.update);
router.delete(
	'/:id',

	serviceUserController.destroy
);
router.get(
	'/',

	serviceUserController.getAllUsers
);
router.get(
	'/:id',

	serviceUserController.getUserById
);
router.get(
	'/company/:company_id/project/:project_id',
	serviceUserController.getTechSupportUsers
);

module.exports = router;
