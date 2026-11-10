import type { HqEmailExtractedDraft, HqEmailVehicleRoute, RouteWaypointItem } from '@/types/emailHq';
import type { DatedExcelCalendarBlock } from './emailCalendarGrid';

const normalized = (value: string) => value.toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(date + 'T00:00:00Z')) && new Date(date+'T00:00:00Z').toISOString().slice(0,10) === date;
const validClock = (s: string) => !s || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);
export const emailVehicleLabelKey = (label: string) => normalized(label) || 'unlabeled';

/** Only an explicit car label is authoritative. No guessed vehicle count from prose. */
export function carLabelInSource(name: string): string | undefined {
  const m = name.match(/\bcar[\s_\-#]*0*(\d+)\b|(?:^|\D)0*(\d+)\s*호차/i);
  if (m) return `Car ${Number(m[1] || m[2])}`;
  const letter = name.match(/\bcar[\s_\-#]*([A-Z])(?=[\s_\-.]|$)/i);
  if (letter) return `Car ${letter[1].toUpperCase()}`;
  return undefined;
}

export function vehicleRouteLabels(draft: Pick<HqEmailExtractedDraft, 'vehicleRoutes'>): string[] {
  const seen = new Set<string>();
  return (draft.vehicleRoutes || []).flatMap(route => {
    const key = emailVehicleLabelKey(route.vehicleLabel);
    if (seen.has(key)) return [];
    seen.add(key);
    return [route.vehicleLabel];
  });
}

/** Gemini's detailed itinerary is authoritative. Simple body-only requests,
 * single-car event plans, and labelled multi-car plans use the same structure.
 */
export function normalizeGeminiVehicleRoutes(raw: unknown, fallbackDate: string): HqEmailVehicleRoute[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 300).flatMap((entry: any, i: number) => {
    // Neutral UI fallback only. Never invent "Car 1" when the client supplied no label.
    const label = (typeof entry?.vehicleLabel === 'string' ? entry.vehicleLabel.trim() : '') || '의전 차량';
    const directDate = typeof entry?.date === 'string' ? entry.date.trim() : '';
    const stopDate = Array.isArray(entry?.stops) ? entry.stops.find((s: any) => validDate(String(s?.date || '')))?.date : '';
    const date = directDate || stopDate || fallbackDate;
    if (!label || !validDate(date) || !Array.isArray(entry?.stops)) return [];
    const stops: RouteWaypointItem[] = entry.stops.slice(0, 120).flatMap((s: any, j: number) => {
      const location = typeof s?.location === 'string' ? s.location.trim() : '';
      if (!location) return [];
      const time = typeof s?.time === 'string' && validClock(s.time.trim()) ? s.time.trim() : '';
      return [{
        id: `ai-car-${i}-stop-${j}`, order: j+1, date, time, location,
        clientAddress: typeof s?.clientAddress === 'string' ? s.clientAddress.trim() || undefined : undefined,
        notes: typeof s?.notes === 'string' ? s.notes.trim() || undefined : undefined,
        isPoiConfirmed: false,
      }];
    });
    if (!stops.length) return [];
    // Multiple blocks can describe the same car/date: combine, never overwrite.
    const routeId = `car-route-${i}`;
    return [{
      id: routeId, vehicleLabel: label, date, stops,
      endTime: typeof entry?.endTime === 'string' && validClock(entry.endTime.trim()) ? entry.endTime.trim() : undefined,
      passengerName: typeof entry?.passengerName === 'string' ? entry.passengerName.trim() || undefined : undefined,
      passengerCount: Number.isInteger(entry?.passengerCount) && entry.passengerCount > 0 ? entry.passengerCount : undefined,
      requestedVehicleClass: typeof entry?.vehicleClass === 'string' ? entry.vehicleClass.trim() || undefined : undefined,
      sourceFilename: typeof entry?.sourceFilename === 'string' ? entry.sourceFilename.trim() || undefined : undefined,
    }];
  }).reduce<HqEmailVehicleRoute[]>((result, route) => {
    const old = result.find(item => item.date === route.date && emailVehicleLabelKey(item.vehicleLabel) === emailVehicleLabelKey(route.vehicleLabel));
    if (!old) result.push(route);
    else {
      const existing = new Set(old.stops.map(stop => [stop.time,normalized(stop.location)].join('|')));
      for (const stop of route.stops) {
        const key = [stop.time,normalized(stop.location)].join('|');
        if (!existing.has(key)) { old.stops.push({ ...stop,order:old.stops.length+1 }); existing.add(key); }
      }
      old.endTime ||= route.endTime;
      old.passengerName ||= route.passengerName;
      old.passengerCount ||= route.passengerCount;
    }
    return result;
  }, []);
}

/**
 * Excel appointment cells are optional evidence for any itinerary. Do NOT
 * fold different files/sheets into the same generic route. If Gemini already
 * found a matching stop, keep its label/notes and avoid duplicate cells.
 * Unknown cell-only locations remain unverified; TMAP validation is separate.
 */
export function reconcileVehicleExcelEvidence(
  draft: HqEmailExtractedDraft,
  records: DatedExcelCalendarBlock[],
): HqEmailExtractedDraft {
  if (!records.length) return draft;
  const groups = new Map<string, DatedExcelCalendarBlock[]>();
  for (const record of records) {
    const key = record.sourceIndex+':'+record.sheetName;
    groups.set(key,[...(groups.get(key) || []),record]);
  }
  // Single Excel grid follows the existing richer appointment reconciliation.
  if (!draft.vehicleRoutes?.length && groups.size === 1) return draft;

  const result: HqEmailVehicleRoute[] = (draft.vehicleRoutes || []).map(route => ({
    ...route, stops: route.stops.map(point => ({ ...point })),
  }));
  const skipped: string[] = [];
  for (const source of groups.values()) {
    const first=source[0];
    const explicit = carLabelInSource(first.sheetName) || carLabelInSource(first.filename);
    const labels = [...new Set(result.map(route=>route.vehicleLabel))];
    const sameFilename = [...new Set(result.filter(route=>route.sourceFilename===first.filename).map(route=>route.vehicleLabel))];
    const matched = (explicit ? labels.find(label => emailVehicleLabelKey(label) === emailVehicleLabelKey(explicit)) : undefined)
      || (sameFilename.length===1 ? sameFilename[0] : undefined)
      || (!explicit && labels.length===1 ? labels[0] : undefined);
    // Unlabelled source rows cannot be attached arbitrarily to another car.
    if (!explicit && labels.length > 1 && !matched) {
      skipped.push(`${first.filename} / ${first.sheetName}: 차량 구분을 확인할 수 없는 원본 셀이 있어요.`);
      continue;
    }
    // Several Excel files do not prove that several cars were requested.
    // When Gemini missed all routes and sources have no car labels, leave a
    // visible warning rather than turning file names into invented fleet slots.
    if (!matched && !explicit && groups.size>1) {
      skipped.push(`${first.filename} / ${first.sheetName}: 차량별 경로를 특정할 수 없어서 원문 확인이 필요해요.`);
      continue;
    }
    const label = matched || explicit || labels[0] || '의전 차량';
    for (const cell of source) {
      let route=result.find(item=>item.date===cell.date && emailVehicleLabelKey(item.vehicleLabel)===emailVehicleLabelKey(label));
      if (!route) {
        route={ id:`source-route-${cell.sourceIndex}-${cell.date}-${normalized(label)}`,
          vehicleLabel:label,date:cell.date,stops:[],sourceFilename:cell.filename };
        result.push(route);
      }
      const sourceText=normalized(cell.originalText);
      const matching=route.stops.some(point =>
        point.date === cell.date &&
        ((Boolean(point.time) && point.time===cell.time && (sourceText.includes(normalized(point.location)) || !point.location.trim())) ||
         (normalized(point.location).length >= 4 && sourceText.includes(normalized(point.location))))
      );
      if(matching)continue;
      route.stops.push({
        id:`excel-${cell.sourceIndex}-${cell.sheetName}-${cell.cell}`,
        order:route.stops.length+1, date:cell.date, time:cell.time,
        location:cell.title, clientAddress:cell.clientAddress,
        isPoiConfirmed:false,
        notes:[`원본 Excel ${cell.filename} / ${cell.sheetName}!${cell.cell}`,cell.originalText].join('\n'),
      });
    }
  }
  const valid = result.filter(route=>route.stops.length>0).map(route=>({
    ...route,stops:[...route.stops].sort((a,b)=>(a.time||'').localeCompare(b.time||'') || a.order-b.order)
      .map((stop,index)=>({...stop,order:index+1})),
  }));
  return {...draft, vehicleRoutes:valid.length ? valid : draft.vehicleRoutes,
    warnings: skipped.length ? [...(draft.warnings || []),...skipped] : draft.warnings};
}

/** Used for day-specific schedules and in the source review cards. */
export function vehicleRouteDays(draft: HqEmailExtractedDraft): HqEmailVehicleRoute[] {
  return [...(draft.vehicleRoutes || [])].sort((a,b)=>
    a.date.localeCompare(b.date) ||
    vehicleRouteLabels(draft).indexOf(a.vehicleLabel) - vehicleRouteLabels(draft).indexOf(b.vehicleLabel));
}
