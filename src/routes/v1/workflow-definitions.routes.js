'use strict';

const router = require('express').Router();
const ctrl = require('../../controllers/workflowDefinition.controller');
const verifyToken = require('../../middlewares/verifyToken');

// All endpoints require authentication; only super_admin should reach these in practice.
// checkPermission is skipped — the AccessWrapper on the frontend and the isSuperAdmin
// check below act as the gate. Add checkPermission('workflow-definitions', ...) later
// if finer-grained RBAC is needed.
router.use(verifyToken);

function requireSuperAdmin(req, res, next) {
	if (!req.user?.isSuperAdmin) {
		return res.status(403).json({ message: 'Super admin access required' });
	}
	next();
}

router.use(requireSuperAdmin);

router.get('/', ctrl.listDefinitions);
router.get('/:id', ctrl.getDefinition);
router.post('/', ctrl.createDefinition);
router.put('/:id', ctrl.updateDefinition);
router.delete('/:id', ctrl.deleteDefinition);
router.post('/:id/activate', ctrl.activateDefinition);

module.exports = router;
