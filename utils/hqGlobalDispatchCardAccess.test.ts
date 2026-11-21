import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const source=(file:string)=>readFileSync(join(process.cwd(),file),'utf8');

test('HQ all-menu and dispatch header open the same lazy, vehicle-first card finder',()=>{
 const dashboard=source('components/hq/HqDashboard.tsx');
 const sidebar=source('components/hq/HqSidebar.tsx');
 const dispatch=source('components/hq/HqDispatchTable.tsx');
 const mobileNav=source('components/hq/HqMobileNav.tsx');
 const global=source('components/hq/drivers/HqDispatchCardGlobalLauncher.tsx');
 assert.match(dashboard,/<HqDispatchCardGlobalLauncher/);
 assert.match(dashboard,/onOpenDispatchCard=\{\(\) => setIsGlobalCardSearchOpen\(true\)\}/);
 assert.match(sidebar,/isMobileDrawer&&onOpenDispatchCard/);
 assert.match(sidebar,/배차카드 빠른 검색/);
 assert.match(dispatch,/onOpenDispatchCard&&/);
 assert.match(dispatch,/배차카드 빠른 검색/);
 const headerActionsMatch=dispatch.match(/onOpenDispatchCard&&[\s\S]*?aria-label="예약 추가"[\s\S]*?<\/HqButton>/);
 assert.ok(headerActionsMatch,'dispatch header action buttons should share HqButton');
 const headerActions=headerActionsMatch[0];
 assert.equal((headerActions.match(/size="md"/g)||[]).length,2);
 assert.equal((headerActions.match(/h-11 min-h-11 shrink-0 whitespace-nowrap px-3! sm:px-4!/g)||[]).length,2);
 assert.doesNotMatch(headerActions,/size="sm"|min-h-10/);
 assert.match(global,/useHqDrivers\(\)/);
 assert.match(global,/\/api\/hq\/drivers\/assets\/coverage/);
 assert.match(global,/<HqDispatchCardQuickFindModal/);
 assert.match(global,/<HqDriverAssetManagerModal/);
 assert.match(global,/<HqDispatchCardBuilderModal/);
 assert.match(global,/initialDriverId=\{previewTarget\.driverId\}/);
 assert.match(global,/initialVehiclePlate=\{previewTarget\.plate\}/);
 // Four essential navigation/actions, without a redundant vehicle tab.
 assert.equal((mobileNav.match(/\{id:'/g)||[]).length,4);
 assert.doesNotMatch(mobileNav,/id:'vehicles'/);
 assert.match(mobileNav,/id:'menu',label:'전체메뉴'/);
});

test('assigned booking opens the actual driver and plate-specific card; unassigned bookings remain guarded',()=>{
 const dashboard=source('components/hq/HqDashboard.tsx');
 const booking=source('components/hq/HqQuickDispatch.tsx');
 const launcher=source('components/hq/bookings/HqBookingCardManagerLauncher.tsx');
 assert.match(dashboard,/booking\.driverId&&plate&&plate!=='미배정'&&plate!=='-'/);
 assert.match(dashboard,/setMissingCardTarget\(\{driverId:booking\.driverId,vehiclePlate:plate\}\)/);
 assert.match(dashboard,/setInfoModalBooking\(booking\)/);
 assert.match(booking,/onOpenDriverVehicleInfo\(initialBooking\)/);
 assert.match(launcher,/<HqDriverAssetManagerModal/);
 assert.match(dashboard,/<HqBookingCardManagerLauncher/);
});

test('obsolete demo card entry is retired; only edit/share icons remain on actual manager',()=>{
 const dashboard=source('components/hq/HqDashboard.tsx');
 const manager=source('components/hq/drivers/HqDriverAssetManagerModal.tsx');
 assert.doesNotMatch(dashboard,/<VipChauffeurCardModal|import \{ VipChauffeurCardModal \}/);
 assert.match(manager,/headerActions=\{<>/);
 assert.equal((manager.match(/<HqIconButton/g)||[]).length,2);
 assert.doesNotMatch(manager,/RefreshCw|배차카드 새로고침/);
 assert.match(manager,/onAssetUpdated=\{refresh\}/);
 assert.match(manager,/initialVehicleId=\{selectedVehicle\?\.uuid\}/);
});
