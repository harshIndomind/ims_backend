'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface) {
		// org_id is nullable for global/default definitions. A plain unique index on
		// (org_id, document_type, version) wouldn't actually enforce anything for those rows,
		// since MySQL treats every NULL as distinct in a unique index. Using a functional
		// index over COALESCE(org_id, 0) collapses all "global" rows into one bucket so
		// "one version N per document_type" is enforced for org-specific AND global rows alike.
		await queryInterface.sequelize.query(
			'CREATE UNIQUE INDEX workflow_definitions_org_doctype_version_unique ON workflow_definitions ((COALESCE(org_id, 0)), document_type, version)',
		);
	},
	async down(queryInterface) {
		await queryInterface.sequelize.query(
			'DROP INDEX workflow_definitions_org_doctype_version_unique ON workflow_definitions',
		);
	},
};
