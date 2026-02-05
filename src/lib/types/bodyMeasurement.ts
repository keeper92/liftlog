export interface BodyMeasurement {
  id: string;
  userId: string;
  date: string;
  bodyWeight: number | null;
  bodyFatPercentage: number | null;
  measurements: Record<string, number>;
  createdAt: string;
}
