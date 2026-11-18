import React, { useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import { Clock, MapPin, Navigation, Phone } from 'lucide-react';
import type { StoreSettings } from '../types';

interface SoporeStoreMapProps {
  settings: StoreSettings;
  getDirectionsLabel: string;
}

const StoreMarkerPin: React.FC<{ settings: StoreSettings }> = ({ settings }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(true);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: settings.latitude, lng: settings.longitude }}
        title={settings.storeName}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Pin background="#FF9900" borderColor="#131921" glyphColor="#131921" scale={1.15} />
      </AdvancedMarker>
      {open && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)} maxWidth={260}>
          <div className="p-1 text-slate-900">
            <p className="font-bold text-sm">{settings.storeName}</p>
            <p className="text-xs text-slate-600 mt-0.5">{settings.address}</p>
            <p className="text-xs text-slate-500 mt-1">PIN: {settings.pinCode} · {settings.phone}</p>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

export const SoporeStoreMap: React.FC<SoporeStoreMapProps> = ({
  settings,
  getDirectionsLabel,
}) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${settings.latitude},${settings.longitude}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs p-6 flex flex-col justify-between">
        <div>
          <p className="text-xs font-bold text-[#E68A00] mb-1.5">
            Sopore Storefront · Jammu &amp; Kashmir
          </p>
          <h3 className="font-display text-2xl font-extrabold text-slate-900 mb-4">{settings.storeName}</h3>

          <div className="space-y-4 text-sm text-slate-700">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-[#FF9900] shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900">Shop Address</p>
                <p className="text-slate-600 leading-relaxed">{settings.address}</p>
                <p className="text-xs font-mono text-slate-500 mt-1 tabular-nums">
                  PIN {settings.pinCode} · {settings.latitude.toFixed(4)}° N, {settings.longitude.toFixed(4)}° E
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-[#FF9900] shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900">Store Hours (IST · Asia/Kolkata)</p>
                <p className="text-slate-600 tabular-nums">
                  Daily: {settings.openingHours} – {settings.closingHours}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-[#FF9900] shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900">Phone &amp; WhatsApp Orders</p>
                <p className="text-slate-600 tabular-nums">{settings.phone}</p>
                <p className="text-xs text-slate-500">{settings.email}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 mt-6 border-t border-slate-100 flex flex-wrap gap-3">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF9900] text-slate-950 text-sm font-extrabold hover:bg-[#E68A00] transition-colors whitespace-nowrap shadow-xs"
          >
            <Navigation className="w-4 h-4" />
            {getDirectionsLabel}
          </a>
          <a
            href={`https://wa.me/${settings.whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#131921] text-white text-sm font-bold hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            WhatsApp Shop
          </a>
        </div>
      </div>

      <div className="lg:col-span-7 rounded-2xl overflow-hidden border border-slate-200/80 shadow-xs bg-[#F5F7FA] min-h-[340px] h-[360px] lg:h-auto relative">
        {apiKey ? (
          <APIProvider
            apiKey={apiKey}
            libraries={['marker']}
            language="en"
            region="IN"
          >
            <GoogleMap
              mapId="DEMO_MAP_ID"
              defaultCenter={{ lat: settings.latitude, lng: settings.longitude }}
              defaultZoom={16}
              gestureHandling="cooperative"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <StoreMarkerPin settings={settings} />
            </GoogleMap>
          </APIProvider>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-[#F5F7FA]">
            <MapPin className="w-10 h-10 text-[#FF9900] mb-3" />
            <p className="font-bold text-slate-900">
              Main Bazar, near Jamia Masjid, Sopore · PIN 193201
            </p>
            <p className="text-sm text-slate-600 mt-1 max-w-md">
              Interactive Google Maps view requires VITE_GOOGLE_MAPS_API_KEY in the runtime environment. Use the button below for turn-by-turn directions.
            </p>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF9900] text-slate-950 text-sm font-extrabold hover:bg-[#E68A00] transition-colors"
            >
              <Navigation className="w-4 h-4" />
              Open in Google Maps
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
