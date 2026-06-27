'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface) {
		await queryInterface.sequelize.query(
			"ALTER TABLE `workflow_actions` MODIFY COLUMN `action` ENUM('submitted','verified','approved','rejected','cancelled','skipped','resubmitted','edited','reopened','archived','restored') NOT NULL",
		);
	},
	async down(queryInterface) {
		await queryInterface.sequelize.query(
			"ALTER TABLE `workflow_actions` MODIFY COLUMN `action` ENUM('submitted','verified','approved','rejected','cancelled','skipped','resubmitted','edited','reopened') NOT NULL",
		);
	},
};
