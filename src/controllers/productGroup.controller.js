const { ProductGroup } = require('../models/index');
const catchAsync = require('../utils/catchAsync'); // optional async wrapper

// CREATE ProductGroup
exports.createProductGroup = catchAsync(async (req, res) => {
  const { name, description } = req.body;
  const organization_id = req.user.org_id; // assume org_id from logged-in user

  const group = await ProductGroup.create({
    name,
    description,
    organization_id,
    is_active: true
  });

  res.status(201).json({ success: true, data: group });
});

// GET all ProductGroups
exports.getAllProductGroups = catchAsync(async (req, res) => {
  const organization_id = req.user.org_id;

  const groups = await ProductGroup.findAll({
    // where: { organization_id }
  });

  res.status(200).json({ success: true, data: groups });
});

// GET single ProductGroup
exports.getProductGroup = catchAsync(async (req, res) => {
  const { id } = req.params;
  const organization_id = req.user.org_id;

  const group = await ProductGroup.findOne({
    where: { id, organization_id }
  });

  if (!group) return res.status(404).json({ success: false, message: 'Not Found' });

  res.status(200).json({ success: true, data: group });
});

// UPDATE ProductGroup
exports.updateProductGroup = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { name, description, is_active } = req.body;
  const organization_id = req.user.org_id;

  const group = await ProductGroup.findOne({ where: { id, organization_id } });
  if (!group) return res.status(404).json({ success: false, message: 'Not Found' });

  await group.update({ name, description, is_active });

  res.status(200).json({ success: true, data: group });
});

// DELETE ProductGroup
exports.deleteProductGroup = catchAsync(async (req, res) => {
  const { id } = req.params;
  const organization_id = req.user.org_id;

  const group = await ProductGroup.findOne({ where: { id, organization_id } });
  if (!group) return res.status(404).json({ success: false, message: 'Not Found' });

  await group.destroy();

  res.status(200).json({ success: true, message: 'ProductGroup deleted successfully' });
});
