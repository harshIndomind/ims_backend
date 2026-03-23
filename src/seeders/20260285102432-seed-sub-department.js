'use strict';

module.exports = {
	async up(queryInterface) {
		await queryInterface.bulkInsert(
			'sub_departments',
			[
				{
					department_id: 1,
					name: 'IT Department',
					description: 'Software & Technical Department',
					is_active: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					department_id: 1,
					name: 'Junior Software Department',
					description: 'Software & Technical Department',
					is_active: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					department_id: 1,
					name: 'Software Department',
					description: 'Software & Technical Department',
					is_active: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					department_id: 1,
					name: 'Sr. Software Department',
					description: 'Software & Technical Department',
					is_active: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					department_id: 1,
					name: 'Project Manager',
					description: 'Software Development - Project Manager',
					is_active: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					department_id: 1,
					name: 'Cloud Infrastructure',
					description: 'Cloud & Devops Infrastructure',
					is_active: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			],
			{},
		);
	},

	async down(queryInterface) {
		await queryInterface.bulkDelete('sub_departments', null, {});
	},
};
