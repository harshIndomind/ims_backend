const router = require('express').Router();
const ProjectController = require('../../controllers/project.controller');
const verifyToken = require('../../middlewares/verifyToken');
const checkRole = require('../../middlewares/checkRole');

router.use(verifyToken); // all routes protected

router.post(
	'/',
	checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']),
	ProjectController.createProject
);
router.get('/', checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']),ProjectController.getAllProjects);
router.get('/:id',checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']), ProjectController.getProject);
router.put(
	'/:id',
	checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']),
	ProjectController.updateProject
);
router.delete('/:id', checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']), ProjectController.deleteProject);
router.get('/company/:id',checkRole(['Super Admin', 'Admin', 'Project Tech Head', 'User', 'Support Engineer']), ProjectController.getProjectByCompanyId);


module.exports = router;
