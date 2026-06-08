import { PhysicsDataRecord } from './FaradayDataPanel';

export interface RecordedExperimentState {
  experiments: PhysicsDataRecord[][];
  selectedIndex: number;
}

export function appendRecordedExperiment(
  experiments: PhysicsDataRecord[][],
  record: PhysicsDataRecord[]
): RecordedExperimentState {
  const selectedIndex = experiments.length;

  return {
    experiments: [...experiments, record],
    selectedIndex,
  };
}
