import type { PhysicsDataRecord } from './FaradayDataPanel';

export function getClickedChartData(event: unknown): PhysicsDataRecord | null {
  if (!event || typeof event !== 'object' || !('activePayload' in event)) {
    return null;
  }

  const activePayload = (event as { activePayload?: Array<{ payload?: PhysicsDataRecord }> }).activePayload;
  return activePayload?.[0]?.payload ?? null;
}
