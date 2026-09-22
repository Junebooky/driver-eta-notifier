/**
 * Protocol Cockpit Fleet System Constants
 */

/**
 * 개발/테스트용 호차 및 프로필 빠른 전환 활성화 플래그
 * - 현재 (개발/관제/시연 단계): true (1호차, 2호차, 4호차 간 자유로운 스케줄 전환 및 관제 모드 지원)
 * - 향후 (기사 실운영 배포 시): false 로 변경하여 타 호차 전환 및 편집 접근을 원천 차단
 */
export const ENABLE_DEV_FLEET_SWITCHER = true;

export interface FleetPresetDriver {
  vehicleNo: string;
  hocha: string;
  plateFront: string;
  plateBack: string;
  carNumber: string;
  driverName: string;
  phone: string;
  defaultNavi: 'tmap' | 'kakao' | 'naver';
}

export const FLEET_PRESET_DRIVERS: FleetPresetDriver[] = [
  {
    vehicleNo: '4호차',
    hocha: '4',
    plateFront: '142호',
    plateBack: '7811',
    carNumber: '142호 7811',
    driverName: '윤태준',
    phone: '010-6348-8726',
    defaultNavi: 'tmap',
  },
  {
    vehicleNo: '8호차',
    hocha: '8',
    plateFront: '142호',
    plateBack: '7815',
    carNumber: '142호 7815',
    driverName: '민성호',
    phone: '010-7231-8340',
    defaultNavi: 'tmap',
  },
  {
    vehicleNo: '1호차',
    hocha: '1',
    plateFront: '110하',
    plateBack: '1035',
    carNumber: '110하 1035',
    driverName: '김의전',
    phone: '010-1111-2222',
    defaultNavi: 'tmap',
  },
  {
    vehicleNo: '2호차',
    hocha: '2',
    plateFront: '112하',
    plateBack: '3456',
    carNumber: '112하 3456',
    driverName: '박의전',
    phone: '010-3333-4444',
    defaultNavi: 'tmap',
  },
];
