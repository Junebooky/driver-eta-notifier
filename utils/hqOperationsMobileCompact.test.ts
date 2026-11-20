import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const read=(path:string)=>readFileSync(join(process.cwd(),path),'utf8');

test('mobile operations header and five KPIs are compact without dropping operational counts',()=>{
 const board=read('components/hq/operations/HqOperationsBoard.tsx');
 assert.match(board,/<HqCard className="space-y-3 rounded-\[24px\] bg-white p-3 sm:space-y-5 sm:p-6/);
 assert.match(board,/grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5/);
 assert.match(board,/min-h-\[62px\]/);
 assert.match(board,/size-8 shrink-0 object-contain/);
 assert.match(board,/sm:min-h-\[98px\]/);
 for(const item of ['kpiStats.totalEvents','kpiStats.totalVehicles','kpiStats.inTransit','kpiStats.completed','kpiStats.progressRate']){
   assert.ok(board.includes(item),item);
 }
});

test('operations query uses shared HQ placeholder typography across mobile and desktop',()=>{
 const board=read('components/hq/operations/HqOperationsBoard.tsx');
 const css=read('app/globals.css');
 assert.match(board,/<HqInput[\s\S]*?placeholder="기사님, 차량번호, 장소로 찾아보세요"[\s\S]*?className="hq-ui-search-compact"/);
 assert.match(css,/\.hq-ui-field\.hq-ui-search-compact::placeholder\s*\{[\s\S]*?font-size:\s*12px/);
 assert.doesNotMatch(board,/placeholder:text-\[#95A3B9\]/);
});

test('event card uses shared quiet badges, responsive rows, and only top-right delete icon',()=>{
 const board=read('components/hq/operations/HqOperationsBoard.tsx');
 assert.match(board,/<HqCard key=\{group.id\}/);
 assert.match(board,/grid grid-cols-2 gap-1\.5 text-xs font-medium/);
 assert.match(board,/col-span-2 inline-flex min-w-0 max-w-full/);
 assert.match(board,/<HqBadge tone="neutral" className="max-w-full/);
 assert.equal((board.match(/<HqBadge tone=\{statusConfig\.isLive\?'selected':'neutral'\}/g)||[]).length,2);
 assert.doesNotMatch(board,/statusConfig\.badgeClass/);
 assert.match(board,/title="행사 삭제"/);
 assert.match(board,/<Trash2 className="size-4" aria-hidden="true"\/>/);
 assert.doesNotMatch(board,/<span>행사 삭제<\/span>/);
 assert.match(board,/setEventToDelete\(eventGroups\.find\(item => item\.id === group\.id\) \|\| group\)/);
 assert.match(board,/onClick=\{\(e\) => handleSendArrivalNotice\(e, item\)\}/);
 assert.match(board,/<HqButton variant="subtle" size="sm"/);
 assert.match(board,/min-w-0 flex-1 truncate text-\[11px\]/);
});

test('dispatch-card access uses the existing real driver icon, including global finder header',()=>{
 const sidebar=read('components/hq/HqSidebar.tsx');
 const dispatch=read('components/hq/HqDispatchTable.tsx');
 const finder=read('components/hq/drivers/HqDispatchCardQuickFindModal.tsx');
 for(const src of [sidebar,dispatch,finder]){
  assert.match(src,/\/images\/icons\/drivers\/icon_driver\.png/);
 }
 assert.doesNotMatch(sidebar,/<ContactRound/);
 assert.doesNotMatch(dispatch,/<ContactRound/);
});
