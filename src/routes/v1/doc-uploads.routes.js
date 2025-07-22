const router = require('express').Router();
const DocumentsUploadsController = require('../../controllers/document-uploads.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const uploadTo = require('../../middlewares/multer');

router.post(
	'/update-status',
	DocumentsUploadsController.updateDocumentStatus
);

router.use(verifyToken);

// router.get(
// 	'/counts',
// 	checkRole([
// 		'Super Admin',
// 		'Admin',
// 		'Project Tech Head',
// 		'User',
// 		'Support Engineer',
// 	]),
// 	DocumentsUploadsController.getIssuesCounts
// );
router.post(
	'/',
	checkRole(['Super Admin', 'Admin', 'Vendor']),
	uploadTo.single('attachment'),
	DocumentsUploadsController.uploadADocument
);
router.get(
	'/:id',
	checkRole(['Super Admin', 'Admin', 'Vendor']),
	DocumentsUploadsController.getAUploadedDoc
);
router.get(
	'/',
	checkRole(['Super Admin', 'Admin', 'Vendor']),
	DocumentsUploadsController.getAllUploadedDocs
);
// router.put(
// 	'/:id',
// 	checkRole([
// 		'Super Admin',
// 		'Admin',
// 		'Project Tech Head',
// 		'User',
// 		'Support Engineer',
// 	]),
// 	uploadTo.single('attachment'),
// 	DocumentsUploadsController.updateIssue
// );
router.delete(
	'/:id',
	checkRole(['Super Admin', 'Admin', 'Vendor']),
	DocumentsUploadsController.deleteUploadedDoc
);
router.get(
	'/getDocumentUrl/:id',
	checkRole(['Super Admin', 'Admin', 'Vendor']),
	DocumentsUploadsController.getDocumentSignedURL
);
router.get(
	'/sendDeleteRequest/:id',
	checkRole(['Super Admin', 'Admin', 'Vendor']),
	DocumentsUploadsController.sendDeleteRequestToAdmin
);

// router.get(
// 	'/:id/history',
// 	checkRole([
// 		'Super Admin',
// 		'Admin',
// 		'Project Tech Head',
// 		'User',
// 		'Support Engineer',
// 	]),
// 	DocumentsUploadsController.getIssueHistory
// );

// Status Counts

module.exports = router;
