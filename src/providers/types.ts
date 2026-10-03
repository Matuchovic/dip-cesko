import type { Alert, DepartureBoard, Envelope, StopGroup, StopPoint, VehicleState, TripDetail, MetroLineGeo } from '@/domain/model';
import type { BBox } from '@/domain/geo';

export interface ProviderInfo { id: 'pid' | 'demo'; name: string; territory: string; attribution: string; license: string }

/** Společné rozhraní adaptérů dopravních systémů (PID, další IDS, ukázková data). */
export interface TransitProvider {
  info: ProviderInfo;
  vehicles(bbox: BBox | null): Promise<Envelope<VehicleState[]>>;
  departures(groupKey: string, limit: number): Promise<Envelope<DepartureBoard>>;
  searchStops(q: string, limit: number): Promise<Envelope<StopGroup[]>>;
  stopsInView(bbox: BBox): Promise<Envelope<StopPoint[]>>;
  alerts(): Promise<Envelope<Alert[]>>;
  /** Průběh spoje podle veřejného ID vozu (service-<typ>-<vůz>). */
  trip(vehicleId: string): Promise<Envelope<TripDetail | null>>;
  /** Linky metra se stanicemi v pořadí. */
  metro(): Promise<Envelope<MetroLineGeo[]>>;
}
