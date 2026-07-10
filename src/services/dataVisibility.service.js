/**
 * DataVisibilityService
 *
 * Centralises role-based data-visibility rules for list queries.
 * All visibility decisions live here so controllers and services stay clean.
 *
 * How it works
 * ────────────
 * super_admin / org_admin
 *   No filter — these roles see all records. Query params (unit_id, department_id)
 *   set by the caller are left untouched.
 *
 * All other roles — mapping-based (primary) with dep_cd fallback
 *   1. Load the user's rows from UserVisibilityMappings.
 *   2. If rows exist → build a Sequelize Op.or condition from every
 *      (unit_id, department_id) pair and AND it into the where clause.
 *      Any unit_id / department_id already set by query params is removed
 *      first (a non-admin cannot bypass their mapping by sending an
 *      arbitrary filter value from the frontend).
 *   3. If no rows exist yet (admin hasn't configured mappings for this
 *      user) → fall back to the legacy dep_cd cross-unit behaviour so
 *      existing users see data as before during the rollout period.
 *
 * Usage
 * ─────
 *   const dataVisibility = require('./dataVisibility.service');
 *
 *   // Generic — module param reserved for future per-module divergence
 *   await dataVisibility.apply(where, req.user, 'budget');
 *
 *   // Module-specific convenience wrappers
 *   await dataVisibility.applyBudgetVisibility(where, req.user);
 *   await dataVisibility.applyIndentVisibility(where, req.user);
 *
 * Extending to new modules
 * ────────────────────────
 *   Call `await dataVisibility.apply(where, req.user, 'work-order')` in the
 *   new service. No other changes required — the mapping-based filter already
 *   works generically because Budget, Indent, PO, WO, GRN etc. all share the
 *   same unit_id / department_id column names.
 */

const { Department, UserVisibilityMapping } = require('../models/index');
const { Op } = require('sequelize');

/** Roles that bypass all visibility filters and see every record. */
const ADMIN_BYPASS_ROLES = ['super_admin', 'org_admin'];

// ─── Mapping-based filter (primary) ──────────────────────────────────────────

/**
 * Mutates `where` to restrict to only the (unit_id, department_id) pairs
 * explicitly granted to the user via UserVisibilityMappings.
 *
 * Clears any raw unit_id / department_id the caller already placed in `where`
 * so a non-admin cannot escalate privileges by passing arbitrary filter values.
 *
 * @param {object} where  - Sequelize where clause being built by the caller.
 * @param {object} user   - req.user
 * @returns {Promise<boolean>} true if mappings were found and applied.
 */
const applyMappingFilter = async (where, user) => {
	const mappings = await UserVisibilityMapping.findAll({
		where: { user_id: user.id },
		attributes: ['unit_id', 'department_id'],
	});

	if (mappings.length === 0) return false;

	// Remove any caller-set filters — the mapping is the authoritative scope.
	delete where.unit_id;
	delete where.department_id;

	// Build: AND ((unit_id = 1 AND department_id = 3) OR (unit_id = 2 AND department_id = 5) …)
	const pairs = mappings.map((m) => ({
		unit_id: m.unit_id,
		department_id: m.department_id,
	}));

	const existing = where[Op.and] ? [].concat(where[Op.and]) : [];
	where[Op.and] = [...existing, { [Op.or]: pairs }];

	return true;
};

// ─── dep_cd fallback (legacy, used when no mappings are configured yet) ───────

/**
 * Cross-unit department filter — the original visibility strategy.
 *
 * Finds every department_id whose depCd matches the user's dep_cd and
 * restricts queries to that set, giving consistent visibility across all
 * units that share the same logical department code.
 *
 * @param {object} where
 * @param {object} user
 */
const applyDepCdFallback = async (where, user) => {
	const { dep_cd, department_id } = user;

	if (dep_cd) {
		const siblings = await Department.findAll({
			where: { depCd: dep_cd },
			attributes: ['id'],
		});

		if (siblings.length > 0) {
			where.department_id = { [Op.in]: siblings.map((d) => d.id) };
		} else if (department_id) {
			where.department_id = department_id;
		}
	} else if (department_id) {
		where.department_id = department_id;
	}
};

// ─── Core mutator ────────────────────────────────────────────────────────────

/**
 * Applies the correct visibility filter to `where` for the given user.
 *
 * Mutates `where` in place (mirrors Sequelize's own convention — callers
 * build a `where` object and pass it to findAll).
 *
 * @param {object} where
 * @param {object} user
 * @returns {Promise<object>} The same `where` reference (for chaining).
 */
const applyVisibility = async (where, user) => {
	const roles = user.roles ?? [];

	// Admin bypass: super_admin and org_admin see everything.
	if (roles.some((r) => ADMIN_BYPASS_ROLES.includes(r))) {
		return where;
	}

	// Primary: explicit mapping-based filter.
	const mappingsApplied = await applyMappingFilter(where, user);

	// Fallback: dep_cd cross-unit filter for users not yet configured.
	if (!mappingsApplied) {
		await applyDepCdFallback(where, user);
	}

	return where;
};

// ─── Public API ──────────────────────────────────────────────────────────────

module.exports = {
	/**
	 * Generic entry point. The `module` parameter is reserved for future
	 * per-module divergence (e.g. GRN needs different rules than Indent).
	 */
	apply: (where, user, module) => applyVisibility(where, user),

	/** Convenience alias — Budget list queries. */
	applyBudgetVisibility: (where, user) => applyVisibility(where, user),

	/** Convenience alias — Indent list queries. */
	applyIndentVisibility: (where, user) => applyVisibility(where, user),
};
