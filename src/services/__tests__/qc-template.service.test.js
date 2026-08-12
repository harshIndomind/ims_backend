'use strict';

const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
const mockQcTemplate = { create: jest.fn(), findByPk: jest.fn(), findAndCountAll: jest.fn() };
const mockQcTemplateItem = { bulkCreate: jest.fn() };

jest.mock('../../models/index', () => ({
	sequelize: { transaction: jest.fn() },
	QcTemplate: mockQcTemplate,
	QcTemplateItem: mockQcTemplateItem,
}));

const { Op } = require('sequelize');
const { sequelize, QcTemplate, QcTemplateItem } = require('../../models/index');
const qcTemplateService = require('../qc-template.service');

beforeEach(() => {
	jest.clearAllMocks();
	sequelize.transaction.mockResolvedValue(mockTransaction);
});

function baseReq(overrides = {}) {
	return { user: { id: 1, org_id: 1, name: 'A', email: 'a@x.com' }, ...overrides };
}

function checklistItem(overrides = {}) {
	return {
		parameter_name: 'Surface finish',
		parameter_type: 'pass_fail',
		is_required: true,
		...overrides,
	};
}

describe('createTemplate', () => {
	it('creates the template and its checklist items in one transaction, then re-fetches with items included', async () => {
		QcTemplate.create.mockResolvedValue({ id: 10 });
		const savedTemplate = { id: 10, name: 'Electronics Incoming QC', items: [{ id: 100 }] };
		QcTemplate.findByPk.mockResolvedValue(savedTemplate);

		const payload = {
			name: 'Electronics Incoming QC',
			document_type: 'purchase_order',
			product_category_id: 5,
			is_default: true,
			items: [checklistItem(), checklistItem({ parameter_name: 'Voltage output', parameter_type: 'numeric', tolerance_min: 215, tolerance_max: 225, unit: 'V' })],
		};

		const result = await qcTemplateService.createTemplate(baseReq(), payload);

		expect(QcTemplate.create).toHaveBeenCalledWith(
			expect.objectContaining({
				org_id: 1,
				name: 'Electronics Incoming QC',
				document_type: 'purchase_order',
				product_category_id: 5,
				is_default: true,
			}),
			{ transaction: mockTransaction },
		);

		expect(QcTemplateItem.bulkCreate).toHaveBeenCalledWith(
			[
				expect.objectContaining({ qc_template_id: 10, sequence: 0, parameter_name: 'Surface finish', parameter_type: 'pass_fail' }),
				expect.objectContaining({
					qc_template_id: 10,
					sequence: 1,
					parameter_name: 'Voltage output',
					parameter_type: 'numeric',
					tolerance_min: 215,
					tolerance_max: 225,
					unit: 'V',
				}),
			],
			{ transaction: mockTransaction },
		);

		expect(mockTransaction.commit).toHaveBeenCalled();
		expect(mockTransaction.rollback).not.toHaveBeenCalled();
		expect(result).toBe(savedTemplate);
	});

	it('defaults document_type to "both" and is_default to false when omitted', async () => {
		QcTemplate.create.mockResolvedValue({ id: 11 });
		QcTemplate.findByPk.mockResolvedValue({ id: 11 });

		await qcTemplateService.createTemplate(baseReq(), { name: 'Generic QC', items: [checklistItem()] });

		expect(QcTemplate.create).toHaveBeenCalledWith(
			expect.objectContaining({ document_type: 'both', is_default: false, product_category_id: null }),
			expect.anything(),
		);
	});

	it('rejects without opening a transaction when items is missing or empty', async () => {
		await expect(qcTemplateService.createTemplate(baseReq(), { name: 'Empty QC', items: [] })).rejects.toThrow(
			'A QC template must include at least one checklist item',
		);
		await expect(qcTemplateService.createTemplate(baseReq(), { name: 'No items field' })).rejects.toThrow(
			'A QC template must include at least one checklist item',
		);

		expect(sequelize.transaction).not.toHaveBeenCalled();
		expect(QcTemplate.create).not.toHaveBeenCalled();
	});

	it('rolls back the transaction if creating the checklist items fails', async () => {
		QcTemplate.create.mockResolvedValue({ id: 12 });
		QcTemplateItem.bulkCreate.mockRejectedValue(new Error('DB constraint violation'));

		await expect(
			qcTemplateService.createTemplate(baseReq(), { name: 'Broken QC', items: [checklistItem()] }),
		).rejects.toThrow('DB constraint violation');

		expect(mockTransaction.rollback).toHaveBeenCalled();
		expect(mockTransaction.commit).not.toHaveBeenCalled();
	});
});

describe('getAllTemplates', () => {
	it('scopes to the caller\'s org (or org-less shared templates) and filters by document_type/is_active', async () => {
		QcTemplate.findAndCountAll.mockResolvedValue({ count: 1, rows: [{ id: 20 }] });

		const req = baseReq({ query: { document_type: 'work_order', is_active: 'true' } });
		const result = await qcTemplateService.getAllTemplates(req);

		expect(QcTemplate.findAndCountAll).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					org_id: { [Op.or]: [1, null] },
					document_type: { [Op.in]: ['work_order', 'both'] },
					is_active: true,
				}),
			}),
		);
		expect(result).toEqual({ count: 1, rows: [{ id: 20 }] });
	});

	it('omits the document_type/is_active filters entirely when not provided', async () => {
		QcTemplate.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

		await qcTemplateService.getAllTemplates(baseReq({ query: {} }));

		const { where } = QcTemplate.findAndCountAll.mock.calls[0][0];
		expect(where).not.toHaveProperty('document_type');
		expect(where).not.toHaveProperty('is_active');
	});
});

describe('getTemplateById', () => {
	it('returns the template with its checklist items when found', async () => {
		const template = { id: 30, items: [{ id: 300 }] };
		QcTemplate.findByPk.mockResolvedValue(template);

		const result = await qcTemplateService.getTemplateById(baseReq(), 30);

		expect(QcTemplate.findByPk).toHaveBeenCalledWith(30, expect.objectContaining({ include: expect.any(Array) }));
		expect(result).toBe(template);
	});

	it('throws a 404 AppError when the template does not exist', async () => {
		QcTemplate.findByPk.mockResolvedValue(null);

		await expect(qcTemplateService.getTemplateById(baseReq(), 999)).rejects.toMatchObject({
			message: 'QC template not found',
			statusCode: 404,
		});
	});
});

describe('deactivateTemplate', () => {
	it('sets is_active to false on an existing template', async () => {
		const update = jest.fn().mockResolvedValue(undefined);
		const template = { id: 40, is_active: true, update };
		QcTemplate.findByPk.mockResolvedValue(template);

		const result = await qcTemplateService.deactivateTemplate(baseReq(), 40);

		expect(update).toHaveBeenCalledWith({ is_active: false });
		expect(result).toBe(template);
	});

	it('throws a 404 AppError when the template does not exist', async () => {
		QcTemplate.findByPk.mockResolvedValue(null);

		await expect(qcTemplateService.deactivateTemplate(baseReq(), 999)).rejects.toMatchObject({
			message: 'QC template not found',
			statusCode: 404,
		});
	});
});
