'use client';
import { GoogleMap, useLoadScript, MarkerF, InfoWindowF } from '@react-google-maps/api';
import { useState } from 'react';

const severityColors = {
  5: '#ef4444',
  4: '#f97316',
  3: '#eab308',
  2: '#3b82f6',
  1: '#22c55e',
};

const categoryEmoji = {
  pothole: '🕳️', streetlight: '💡', drainage: '🌊',
  garbage: '🗑️', water_leak: '💧', other: '⚠️',
};

export default function IssueMap({ issues }) {
  const [selected, setSelected] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(false);

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY,
  });

  const center = { lat: 29.1492, lng: 75.7217 };

  if (!isLoaded) return (
    <div className="w-full h-[500px] bg-gray-100 rounded-3xl flex items-center justify-center">
      <p className="text-gray-400 text-sm">Loading map...</p>
    </div>
  );

  return (
    <div>
      {/* Toggle buttons */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => setShowHeatmap(false)}
          className={'text-xs px-3 py-1.5 rounded-full font-medium transition-colors ' + (!showHeatmap ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600')}
        >
          📍 Pins
        </button>
        <button
          onClick={() => setShowHeatmap(true)}
          className={'text-xs px-3 py-1.5 rounded-full font-medium transition-colors ' + (showHeatmap ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600')}
        >
          🔥 Heatmap
        </button>
      </div>

      <GoogleMap
        zoom={12}
        center={center}
        mapContainerClassName="w-full h-[500px] rounded-3xl shadow-xl"
        options={{ disableDefaultUI: true, zoomControl: true }}
      >
        {issues.map(issue => {
          if (!issue.coords) return null;

          // Heatmap mode — large semi-transparent circles
          if (showHeatmap) {
            return (
              <MarkerF
                key={issue.id}
                position={{ lat: issue.coords.lat, lng: issue.coords.lng }}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 30 + (issue.severity * 15),
                  fillColor: severityColors[issue.severity] || '#6b7280',
                  fillOpacity: 0.3,
                  strokeColor: severityColors[issue.severity] || '#6b7280',
                  strokeWeight: 2,
                  strokeOpacity: 0.8,
                }}
                onClick={() => setSelected(issue)}
              />
            );
          }

          // Pin mode — normal markers
          return (
            <MarkerF
              key={issue.id}
              position={{ lat: issue.coords.lat, lng: issue.coords.lng }}
              onClick={() => setSelected(issue)}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 10 + issue.severity * 2,
                fillColor: issue.isEmergency ? '#ef4444' : (severityColors[issue.severity] || '#6b7280'),
                fillOpacity: 0.9,
                strokeColor: '#ffffff',
                strokeWeight: 2,
              }}
            />
          );
        })}

        {/* Info window */}
        {selected && (
          <InfoWindowF
            position={{ lat: selected.coords.lat, lng: selected.coords.lng }}
            onCloseClick={() => setSelected(null)}
          >
            <div className="p-1 max-w-xs">
              {selected.imageUrl && (
                <img src={selected.imageUrl} className="w-full h-24 object-cover rounded-lg mb-2" alt="" />
              )}
              <p className="font-semibold text-gray-900 text-sm">
                {categoryEmoji[selected.category]} {selected.title}
              </p>
              <p className="text-xs text-gray-500 mt-1">{selected.location}</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                  Sev. {selected.severity}/5
                </span>
                {selected.impactScore && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                    Impact: {selected.impactScore}
                  </span>
                )}
                {selected.isEmergency && (
                  <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full">
                    🚨 Emergency
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">{'→'} {selected.department}</p>
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>

      {/* Heatmap legend */}
      {showHeatmap && (
        <div className="flex items-center gap-4 mt-2 px-1">
          <p className="text-xs text-gray-500 font-medium">Severity:</p>
          {[
            { color: '#22c55e', label: 'Low (1-2)' },
            { color: '#eab308', label: 'Medium (3)' },
            { color: '#f97316', label: 'High (4)' },
            { color: '#ef4444', label: 'Critical (5)' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full opacity-70" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-gray-500">{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}