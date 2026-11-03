const router = require('express').Router();
const ProjectController = require('../../controllers/project.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkPermission = require('../../middlewares/checkPermission');
const {
	validationCreateProject,
	validationUpdateProject,
} = require('../../validations/Project.validator');
const { validate } = require('../../middlewares/validate');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkPermission('project', 'create'),
	validationCreateProject,
	validate,
	ProjectController.createProject,
);
router.put(
	'/:id',
	checkPermission('project', 'edit'),
	validationUpdateProject,
	validate,
	ProjectController.updateProject,
);
router.get('/', checkPermission('project', 'view'), ProjectController.getAllProjects);
router.get('/:id', checkPermission('project', 'view'), ProjectController.getProjectById);
router.delete('/:id', checkPermission('project', 'delete'), ProjectController.deleteProject);

module.exports = router;