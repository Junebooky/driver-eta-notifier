import proj4 from 'proj4';

/**
 * Coordinate system definitions
 * KATEC (TM128): Used by KNOC Opinet API
 * WGS84 (EPSG:4326): Standard GPS latitude and longitude
 */
const KATEC =
  '+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43';
const WGS84 = 'EPSG:4326';

/**
 * Convert WGS84 (Longitude, Latitude) to KATEC (x, y)
 */
export const toKatec = (lon: number, lat: number): [number, number] => {
  const result = proj4(WGS84, KATEC, [lon, lat]);
  return [result[0], result[1]];
};

/**
 * Convert KATEC (x, y) to WGS84 (Longitude, Latitude)
 */
export const toWgs84 = (x: number, y: number): [number, number] => {
  const result = proj4(KATEC, WGS84, [x, y]);
  return [result[0], result[1]];
};
