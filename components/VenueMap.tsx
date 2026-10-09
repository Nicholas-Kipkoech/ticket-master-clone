"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

type VenueMapProps = {
  venue: string;
  location: string | null;
};

type Coordinates = [number, number];

const venueIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

function MapController({ position }: { position: Coordinates }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo(position, 16, { duration: 0.8 });
  }, [map, position]);

  return null;
}

export default function VenueMap({ venue, location }: VenueMapProps) {
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function findVenue() {
      setLoading(true);
      setError(false);
      setPosition(null);

      try {
        const query = encodeURIComponent(
          [venue, location].filter(Boolean).join(", "),
        );

        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${query}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Location search failed");
        }

        const results: { lat: string; lon: string }[] = await response.json();

        if (!results.length) {
          setError(true);
          return;
        }

        setPosition([Number(results[0].lat), Number(results[0].lon)]);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        setError(true);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    if (!venue.trim()) {
      return () => controller.abort();
    }

    void findVenue();

    return () => controller.abort();
  }, [venue, location]);

  if (loading && venue.trim()) {
    return (
      <div className="flex h-64 items-center justify-center bg-(--input-bg) sm:h-80">
        <div className="flex items-center gap-2 text-sm text-(--muted)">
          <span className="size-4 animate-spin rounded-full border-2 border-[#1f4fd8] border-t-transparent" />
          Finding venue on map...
        </div>
      </div>
    );
  }

  if (!venue.trim() || error || !position) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 bg-(--input-bg) px-5 text-center sm:h-80">
        <p className="font-semibold text-(--text)">Map location unavailable</p>
        <p className="max-w-sm text-sm text-(--muted)">
          We couldn&apos;t find this venue. Try adding its full street address,
          city, and country.
        </p>
      </div>
    );
  }

  return (
    <MapContainer
      center={position}
      zoom={16}
      scrollWheelZoom
      className="h-64 w-full sm:h-80"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapController position={position} />

      <Marker position={position} icon={venueIcon}>
        <Popup>
          <div>
            <strong>{venue}</strong>
            {location && <p>{location}</p>}
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}
