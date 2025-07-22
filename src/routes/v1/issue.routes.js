const router = require('express').Router();
const IssueController = require('../../controllers/issue.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');
const uploadTo = require('../../middlewares/multer')
router.use(verifyToken);

// router.get(
// 	'/counts',
// 	checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']),
// 	IssueController.getIssuesCounts
// );
// router.post(
// 	'/',
// 	checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User']),
// 	uploadTo('uploads/issues').array('attachments', 5),
// 	IssueController.createIssue
// );
// router.get(
// 	'/:id',
// 	checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']),
// 	IssueController.getIssue
// );
// router.get(
// 	'/',
// 	checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']),
// 	IssueController.getAllIssues
// );
// router.put(
// 	'/:id',
// 	checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']),
// 	uploadTo('uploads/issues').array('attachments', 5),
// 	IssueController.updateIssue
// );
// router.delete(
// 	'/:id',
// 	checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']),
// 	IssueController.deleteIssue
// );
// router.get(
// 	'/:id/history',
// 	checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']),
// 	IssueController.getIssueHistory
// );

// Status Counts

module.exports = router;
