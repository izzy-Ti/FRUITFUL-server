import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocationMatchResult {
  matches: boolean;
  distanceKm?: number;
  isRemote?: boolean;
}

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);
  private readonly geocodingApiKey: string | null = null;

  // Pre-mapped coordinates for major global tech hubs and metropolitan regions
  private readonly cityDictionary: Record<string, Coordinates> = {
    // North America
    'san francisco': { latitude: 37.7749, longitude: -122.4194 },
    'silicon valley': { latitude: 37.3861, longitude: -122.0839 },
    'san jose': { latitude: 37.3382, longitude: -121.8863 },
    'new york': { latitude: 40.7128, longitude: -74.006 },
    'nyc': { latitude: 40.7128, longitude: -74.006 },
    'seattle': { latitude: 47.6062, longitude: -122.3321 },
    'austin': { latitude: 30.2672, longitude: -97.7431 },
    'boston': { latitude: 42.3601, longitude: -71.0589 },
    'los angeles': { latitude: 34.0522, longitude: -118.2437 },
    'chicago': { latitude: 41.8781, longitude: -87.6298 },
    'toronto': { latitude: 43.6532, longitude: -79.3832 },
    'vancouver': { latitude: 49.2827, longitude: -123.1207 },

    // Europe
    'london': { latitude: 51.5074, longitude: -0.1278 },
    'berlin': { latitude: 52.52, longitude: 13.405 },
    'paris': { latitude: 48.8566, longitude: 2.3522 },
    'amsterdam': { latitude: 52.3676, longitude: 4.9041 },
    'dublin': { latitude: 53.3498, longitude: -6.2603 },
    'stockholm': { latitude: 59.3293, longitude: 18.0686 },
    'zurich': { latitude: 47.3769, longitude: 8.5417 },
    'madrid': { latitude: 40.4168, longitude: -3.7038 },
    'barcelona': { latitude: 41.3879, longitude: 2.1699 },
    'warsaw': { latitude: 52.2297, longitude: 21.0122 },

    // Africa
    'nairobi': { latitude: -1.2921, longitude: 36.8219 },
    'lagos': { latitude: 6.5244, longitude: 3.3792 },
    'cape town': { latitude: -33.9249, longitude: 18.4241 },
    'johannesburg': { latitude: -26.2041, longitude: 28.0473 },
    'cairo': { latitude: 30.0444, longitude: 31.2357 },
    'kigali': { latitude: -1.9441, longitude: 30.0619 },
    'accra': { latitude: 5.6037, longitude: -0.187 },

    // Asia & Pacific
    'singapore': { latitude: 1.3521, longitude: 103.8198 },
    'tokyo': { latitude: 35.6762, longitude: 139.6503 },
    'sydney': { latitude: -33.8688, longitude: 151.2093 },
    'melbourne': { latitude: -37.8136, longitude: 144.9631 },
    'bangalore': { latitude: 12.9716, longitude: 77.5946 },
    'bengaluru': { latitude: 12.9716, longitude: 77.5946 },
    'hyderabad': { latitude: 17.385, longitude: 78.4867 },
    'mumbai': { latitude: 19.076, longitude: 72.8777 },
    'seoul': { latitude: 37.5665, longitude: 126.978 },
    'tel aviv': { latitude: 32.0853, longitude: 34.7818 },
    'dubai': { latitude: 25.2048, longitude: 55.2708 },

    // Latin America
    'sao paulo': { latitude: -23.5505, longitude: -46.6333 },
    'buenos aires': { latitude: -34.6037, longitude: -58.3816 },
    'mexico city': { latitude: 19.4326, longitude: -99.1332 },
  };

  constructor(private readonly configService: ConfigService) {
    this.geocodingApiKey =
      this.configService.get<string>('GOOGLE_MAPS_API_KEY') ||
      process.env.GOOGLE_MAPS_API_KEY ||
      this.configService.get<string>('GEOCODING_API_KEY') ||
      process.env.GEOCODING_API_KEY ||
      null;

    if (this.geocodingApiKey) {
      this.logger.log('External Geocoding API key detected for extended location searches.');
    }
  }

  /**
   * Calculates Haversine distance between two latitude/longitude points in kilometers.
   */
  calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  /**
   * Resolves a location name or string to coordinates.
   * Checks built-in dictionary first; can query external geocoding API if key configured.
   */
  async geocodeLocation(locationName: string): Promise<Coordinates | null> {
    if (!locationName) return null;
    const normalized = locationName.trim().toLowerCase();

    // Check direct dictionary matches
    for (const [city, coords] of Object.entries(this.cityDictionary)) {
      if (normalized === city || normalized.includes(city) || city.includes(normalized)) {
        return coords;
      }
    }

    // If external geocoding API key is available, can query external provider (Google Maps or Mapbox)
    if (
      this.geocodingApiKey &&
      this.geocodingApiKey !== 'your_google_maps_api_key_here' &&
      this.geocodingApiKey !== 'your_geocoding_api_key_here'
    ) {
      try {
        if (this.geocodingApiKey.startsWith('AIza')) {
          // Google Maps Geocoding API
          const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
            locationName,
          )}&key=${this.geocodingApiKey}`;
          const res = await fetch(url);
          if (res.ok) {
            const data: any = await res.json();
            if (data.results && data.results.length > 0) {
              const { lat, lng } = data.results[0].geometry.location;
              return { latitude: lat, longitude: lng };
            }
          }
        } else {
          // Mapbox Geocoding fallback
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            locationName,
          )}.json?access_token=${this.geocodingApiKey}&limit=1`;
          const res = await fetch(url);
          if (res.ok) {
            const data: any = await res.json();
            if (data.features && data.features.length > 0) {
              const [longitude, latitude] = data.features[0].center;
              return { latitude, longitude };
            }
          }
        }
      } catch (err) {
        this.logger.warn(`External geocoding failed for "${locationName}":`, err);
      }
    }

    return null;
  }

  /**
   * Evaluates if a given item (job or profile) matches requested location criteria.
   * Supports:
   * - Radius/distance bounds (Haversine)
   * - Remote job inclusion
   * - Text-based substring matching
   */
  async evaluateLocationMatch(
    item: {
      location?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      workplaceType?: string | null;
    },
    criteria: {
      location?: string;
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
      includeRemote?: boolean;
    },
  ): Promise<LocationMatchResult> {
    const isRemote =
      item.workplaceType === 'remote' ||
      (item.location || '').toLowerCase().includes('remote');

    // Remote workplace inclusion
    if (isRemote && criteria.includeRemote !== false) {
      return { matches: true, isRemote: true, distanceKm: 0 };
    }

    // Resolve target coordinates from criteria
    let targetCoords: Coordinates | null = null;
    if (criteria.latitude !== undefined && criteria.longitude !== undefined) {
      targetCoords = { latitude: criteria.latitude, longitude: criteria.longitude };
    } else if (criteria.location) {
      targetCoords = await this.geocodeLocation(criteria.location);
    }

    // If target coordinates are determined and radius is requested
    if (targetCoords) {
      const radius = criteria.radiusKm && criteria.radiusKm > 0 ? criteria.radiusKm : 50;

      // Determine item coordinates
      let itemCoords: Coordinates | null = null;
      if (item.latitude !== undefined && item.latitude !== null && item.longitude !== undefined && item.longitude !== null) {
        itemCoords = { latitude: item.latitude, longitude: item.longitude };
      } else if (item.location) {
        itemCoords = await this.geocodeLocation(item.location);
      }

      if (itemCoords) {
        const distanceKm = this.calculateDistanceKm(
          targetCoords.latitude,
          targetCoords.longitude,
          itemCoords.latitude,
          itemCoords.longitude,
        );

        if (distanceKm <= radius) {
          return { matches: true, distanceKm, isRemote: false };
        } else {
          return { matches: false, distanceKm, isRemote: false };
        }
      }
    }

    // Fallback: If no coordinates could be derived, check text match
    if (criteria.location && item.location) {
      const criteriaLoc = criteria.location.toLowerCase().trim();
      const itemLoc = item.location.toLowerCase().trim();
      const textMatch = itemLoc.includes(criteriaLoc) || criteriaLoc.includes(itemLoc);
      return { matches: textMatch, isRemote };
    }

    // If no location criteria specified, matches by default
    return { matches: true, isRemote };
  }
}
