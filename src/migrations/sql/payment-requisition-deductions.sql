-- =============================================================================
-- Payment Requisition Deductions — Raw SQL Migration
-- Run manually or as part of a DBA deployment checklist.
-- These are idempotent guards so re-running is safe.
-- =============================================================================

-- Step 1: Create the PaymentRequisitionDeductions table
-- =============================================================================
CREATE TABLE IF NOT EXISTS `PaymentRequisitionDeductions` (
  `id`                       INT          NOT NULL AUTO_INCREMENT,
  `payment_requisition_id`   INT          NOT NULL,
  `deduction_type`           ENUM(
                               'RETENTION',
                               'TDS',
                               'SECURITY_DEPOSIT',
                               'ADVANCE_RECOVERY',
                               'LD',
                               'GST_TDS',
                               'WCT',
                               'OTHER'
                             )            NOT NULL,
  `deduction_name`           VARCHAR(150) NULL,
  `percentage`               DECIMAL(5,2) NULL        DEFAULT NULL,
  `amount`                   DECIMAL(15,2) NOT NULL   DEFAULT 0.00,
  `remarks`                  TEXT         NULL,
  `createdAt`                DATETIME     NOT NULL,
  `updatedAt`                DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_prd_payment_requisition`
    FOREIGN KEY (`payment_requisition_id`)
    REFERENCES `PaymentRequisitions` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Indexes for foreign key lookup and reporting aggregations
CREATE INDEX IF NOT EXISTS `idx_prd_payment_requisition_id`
  ON `PaymentRequisitionDeductions` (`payment_requisition_id`);

CREATE INDEX IF NOT EXISTS `idx_prd_deduction_type`
  ON `PaymentRequisitionDeductions` (`deduction_type`);

-- =============================================================================
-- Step 2: Extend PaymentRequisitions with new columns
-- =============================================================================

-- 2a. Requisition type discriminator (REGULAR vs RETENTION_RELEASE)
ALTER TABLE `PaymentRequisitions`
  ADD COLUMN IF NOT EXISTS `requisition_type`
    ENUM('REGULAR', 'RETENTION_RELEASE') NOT NULL DEFAULT 'REGULAR'
    AFTER `requisition_against`;

-- 2b. Gross amount (billable before deductions; mirrors requisition_amount)
ALTER TABLE `PaymentRequisitions`
  ADD COLUMN IF NOT EXISTS `gross_amount`
    DECIMAL(15,2) NOT NULL DEFAULT 0.00
    AFTER `wo_po_amount`;

-- 2c. Sum of all child deduction rows
ALTER TABLE `PaymentRequisitions`
  ADD COLUMN IF NOT EXISTS `total_deductions`
    DECIMAL(15,2) NOT NULL DEFAULT 0.00
    AFTER `gross_amount`;

-- 2d. Actual cash payable to vendor
ALTER TABLE `PaymentRequisitions`
  ADD COLUMN IF NOT EXISTS `net_payable`
    DECIMAL(15,2) NOT NULL DEFAULT 0.00
    AFTER `total_deductions`;

-- =============================================================================
-- Step 3: Back-fill new columns from legacy values on existing rows
-- =============================================================================
UPDATE `PaymentRequisitions`
SET
  `gross_amount`    = COALESCE(`requisition_amount`, 0),
  `total_deductions` = COALESCE(`tds_amount`, 0),
  `net_payable`     = COALESCE(
                        `total_amount`,
                        COALESCE(`requisition_amount`, 0) - COALESCE(`tds_amount`, 0)
                      )
WHERE `gross_amount` = 0;

-- =============================================================================
-- Step 4: Composite indexes for high-volume PO/WO aggregation queries
-- =============================================================================
CREATE INDEX IF NOT EXISTS `idx_pr_po_id_status_type`
  ON `PaymentRequisitions` (`po_id`, `status`, `requisition_type`);

CREATE INDEX IF NOT EXISTS `idx_pr_wo_id_status_type`
  ON `PaymentRequisitions` (`wo_id`, `status`, `requisition_type`);

-- =============================================================================
-- ROLLBACK (run in reverse order if needed)
-- =============================================================================
-- DROP INDEX `idx_pr_wo_id_status_type` ON `PaymentRequisitions`;
-- DROP INDEX `idx_pr_po_id_status_type` ON `PaymentRequisitions`;
-- ALTER TABLE `PaymentRequisitions` DROP COLUMN `net_payable`;
-- ALTER TABLE `PaymentRequisitions` DROP COLUMN `total_deductions`;
-- ALTER TABLE `PaymentRequisitions` DROP COLUMN `gross_amount`;
-- ALTER TABLE `PaymentRequisitions` DROP COLUMN `requisition_type`;
-- DROP TABLE IF EXISTS `PaymentRequisitionDeductions`;
