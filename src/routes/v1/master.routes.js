const express = require('express');
const router = express.Router();

router.use(`/major-head`, require('./masterMajorHead.routes'));
router.use(`/sub-head`, require('./masterSubHead.routes'));
router.use(`/period`, require('./masterPeriod.routes'));
router.use(`/major-head-amount`, require('./masterMajorHeadAmount.routes'));
router.use(`/sub-head-amount`, require('./masterSubHeadAmount.routes'));
router.use(`/sub-head-cost-center-amount`, require('./masterSubHeadCostCenterAmount.routes'));
router.use(`/budget`, require('./budget.routes'));
router.use(`/cost-center`, require('./costCenter.routes'));
router.use(`/accounts`, require('./masterAccounts.routes'));
router.use(`/term-categories`, require('./masterTermCategory.routes'));
router.use(`/terms`, require('./masterTerms.routes'));
router.use(`/transporter`, require('./masterTransporter.routes'));
router.use(`/units`, require('./masterUnit.routes'));
router.use(`/place-of-use`, require('./masterPlaceOfUse.routes'));
router.use(`/`, require('./orderDispatchLookup.routes'));
router.use('/additional-notes-templates', require('./masterAdditionalNotesTemplate.routes'));

module.exports = router;
