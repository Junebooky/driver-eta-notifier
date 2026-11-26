/** Fixed legacy product boundary, not a tenant-selectable preference.
 * Standard driving logs and expenses must not depend on this module.
 * Do not normalize unknown organizations into the VIP organization.
 */
export const VIP_EXCEL_ORG = 'vip_limousine_korea' as const;
export function hasLegacyExcelAccess(org: unknown): org is typeof VIP_EXCEL_ORG {
  return org === VIP_EXCEL_ORG;
}
export function assertLegacyExcelAccess(org: unknown): asserts org is typeof VIP_EXCEL_ORG {
  if (!hasLegacyExcelAccess(org)) throw new Error('이 업체는 기존 Excel 운행보고 기능을 사용할 수 없습니다.');
}
