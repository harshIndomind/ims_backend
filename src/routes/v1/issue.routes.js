const router = require('express').Router();
const IssueController = require('../../controllers/issue.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');
const {
	validationCreateIssue,
	validationUpdateIssue,
} = require('../../validations/Issue.validator');
const { validate } = require('../../middlewares/validate');

router.use(verifyToken); // all routes protected

// These fixed paths must stay above '/:id', otherwise "assignees" or "summary"
// would be read as an issue id
router.get('/assignees', checkPermission('issue', 'view'), IssueController.getAssignees);
router.get('/summary', checkPermission('issue', 'view'), IssueController.getSummary);

router.post(
	'/',
	checkPermission('issue', 'create'),
	validationCreateIssue,
	validate,
	IssueController.createIssue,
);
router.put(
	'/:id',
	checkPermission('issue', 'edit'),
	validationUpdateIssue,
	validate,
	IssueController.updateIssue,
);
router.get('/', checkPermission('issue', 'view'), IssueController.getAllIssues);
router.get('/:id', checkPermission('issue', 'view'), IssueController.getIssueById);
router.delete('/:id', checkPermission('issue', 'delete'), IssueController.deleteIssue);

module.exports = router;