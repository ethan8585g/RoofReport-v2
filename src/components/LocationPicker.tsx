import React, { useEffect, useRef, useState } from 'react';

interface LocationPickerProps {
    initialLat?: number;
    initialLng?: number;
    onLocationSelect: (lat: number, lng: number) => void;
    apiKey: string;
}

declare global {
    interface Window {
        google: any;
        initMap?: () => void;
    }
}

const LocationPicker: React.FC<LocationPickerProps> = ({ initialLat, initialLng, onLocationSelect, apiKey }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const [map, setMap] = useState<any>(null);
    const [marker, setMarker] = useState<any>(null);

    useEffect(() => {
        // Load Google Maps script if not already loaded
        if (!window.google) {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
            script.async = true;
            script.onload = initMap;
            document.head.appendChild(script);
        } else {
            initMap();
        }

        return () => {
            // Cleanup if needed
        };
    }, [apiKey]);

    const initMap = () => {
        if (!mapRef.current) return;

        const defaultLocation = { lat: initialLat || 49.2827, lng: initialLng || -123.1207 }; // Default to Vancouver if no init provided

        const mapInstance = new window.google.maps.Map(mapRef.current, {
            center: defaultLocation,
            zoom: 19, // High zoom for satellite view
            mapTypeId: 'satellite',
            streetViewControl: false,
            mapTypeControl: false,
        });

        const markerInstance = new window.google.maps.Marker({
            position: defaultLocation,
            map: mapInstance,
            draggable: true,
            title: "Drag to pin exact roof location",
        });

        // Update location on drag end
        markerInstance.addListener('dragend', () => {
            const position = markerInstance.getPosition();
            onLocationSelect(position.lat(), position.lng());
        });

        // Update location on map click
        mapInstance.addListener('click', (e: any) => {
            const position = e.latLng;
            markerInstance.setPosition(position);
            onLocationSelect(position.lat(), position.lng());
        });

        setMap(mapInstance);
        setMarker(markerInstance);
    };

    // Update marker if initial props change
    useEffect(() => {
        if (map && marker && initialLat && initialLng) {
            const newPos = { lat: initialLat, lng: initialLng };
            marker.setPosition(newPos);
            map.setCenter(newPos);
        }
    }, [initialLat, initialLng, map, marker]);

    return (
        <div className="location-picker-container">
            <div
                ref={mapRef}
                style={{ width: '100%', height: '400px', borderRadius: '0.5rem' }}
            />
            <div style={{ marginTop: '10px', fontSize: '0.9em', color: '#666' }}>
                <i className="fas fa-info-circle"></i> Drag the pin to center it on the roof you want to measure.
            </div>
        </div>
    );
};

export default LocationPicker;
