"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type VenueMapProps = {
  venue: string;
  location?: string | null;
};

type Coordinates = {
  lat: number;
  lng: number;
};

const DEFAULT_CENTER: Coordinates = {
  lat: -1.286389,
  lng: 36.817223,
};

function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => window.clearTimeout(timer);
  }, [map]);

  return null;
}

export default function VenueMap({ venue, location }: VenueMapProps) {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function findVenue() {
      setLoading(true);
      setError(false);
      setCoordinates(null);

      const query = [venue, location].filter(Boolean).join(", ");

      if (!query.trim()) {
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams({
          q: query,
          format: "jsonv2",
          limit: "1",
        });

        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        );

        if (!response.ok) {
          throw new Error("Unable to find this venue.");
        }

        const results: Array<{
          lat: string;
          lon: string;
        }> = await response.json();

        if (cancelled) return;

        if (results.length > 0) {
          setCoordinates({
            lat: Number(results[0].lat),
            lng: Number(results[0].lon),
          });
        } else {
          setError(true);
        }
      } catch {
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    findVenue();

    return () => {
      cancelled = true;
    };
  }, [venue, location]);

  const center = coordinates ?? DEFAULT_CENTER;

  const markerIcon = L.divIcon({
    className: "venue-map-marker",
    html: `       <div style="
        width: 30px;
        height: 30px;
        border-radius: 50% 50% 50% 0;
        background: #2563eb;
        border: 3px solid white;
        transform: rotate(-45deg);
        box-shadow: 0 2px 8px rgba(0,0,0,.25);
      "></div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });

  return (
    <div className="venue-map-wrapper relative mt-3 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-gray-200">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100">
          {" "}
          <p className="text-sm text-gray-500">
            Finding venue location...{" "}
          </p>{" "}
        </div>
      )}

      {error && !loading && (
        <div className="absolute left-2 right-2 top-2 z-[500] rounded-lg bg-white/95 px-3 py-2 text-sm text-gray-700 shadow">
          Could not find this venue. Check the venue name or location.
        </div>
      )}

      <MapContainer
        center={[center.lat, center.lng]}
        zoom={coordinates ? 15 : 12}
        scrollWheelZoom={false}
        className="venue-map"
        style={{
          width: "100%",
          height: "100%",
          maxWidth: "100%",
        }}
      >
        <MapResizeHandler />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {coordinates && (
          <Marker
            position={[coordinates.lat, coordinates.lng]}
            icon={markerIcon}
          />
        )}
      </MapContainer>
    </div>
  );
}
