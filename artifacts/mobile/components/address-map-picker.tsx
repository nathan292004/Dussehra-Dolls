import React, { useEffect, useMemo, useRef } from "react";
import { Platform, StyleSheet, View, Text } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import Colors from "@/constants/colors";

export interface PickedAddress {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  // Filled from Google's result when available, to save typing.
  street?: string;
  locality?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

interface Props {
  initial?: Partial<PickedAddress>;
  onSelect: (picked: PickedAddress) => void;
}

export default function AddressMapPicker({ initial, onSelect }: Props) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const mapKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const baseUrl = Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.origin
    : (process.env.EXPO_PUBLIC_API_URL || "https://localhost").replace(/\/api\/?$/, "");
  const html = useMemo(() => buildMapHtml(mapKey, initial), [mapKey, initial?.latitude, initial?.longitude]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || typeof event.data !== "string") return;
      try {
        const data = JSON.parse(event.data) as PickedAddress;
        if (isPickedAddress(data)) onSelect(data);
      } catch { /* Ignore messages that are not map selections. */ }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onSelect]);

  const handleNativeMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as PickedAddress;
      if (isPickedAddress(data)) onSelect(data);
    } catch { /* Ignore malformed map events. */ }
  };

  if (!mapKey) {
    return <View style={styles.missingKey}><Text style={styles.missingTitle}>Google Maps needs an API key</Text>
      <Text style={styles.missingText}>Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY after enabling Maps JavaScript API and Geocoding API in Google Cloud.</Text></View>;
  }

  if (Platform.OS === "web") {
    return React.createElement("iframe", {
      ref: frameRef,
      title: "Choose delivery location on Google Maps",
      srcDoc: html,
      allow: "geolocation",
      referrerPolicy: "origin",
      style: { width: "100%", height: "100%", minHeight: 360, border: 0, borderRadius: 14 },
    });
  }

  return <WebView source={{ html, baseUrl }} originWhitelist={["*"]} onMessage={handleNativeMessage}
    javaScriptEnabled domStorageEnabled style={styles.webView} />;
}

function isPickedAddress(data: any): data is PickedAddress {
  return typeof data?.formattedAddress === "string" && data.formattedAddress.length >= 5 &&
    Number.isFinite(data.latitude) && Number.isFinite(data.longitude);
}

function buildMapHtml(key: string, initial?: Partial<PickedAddress>) {
  const center = {
    lat: Number.isFinite(initial?.latitude) ? initial!.latitude : 20.5937,
    lng: Number.isFinite(initial?.longitude) ? initial!.longitude : 78.9629,
  };
  const marker = initial?.latitude && initial?.longitude ? `new google.maps.LatLng(${center.lat},${center.lng})` : "null";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>html,body,#map{height:100%;width:100%;margin:0;font:15px Arial,sans-serif}.panel{position:absolute;z-index:2;top:10px;left:10px;right:10px;display:flex;gap:8px;background:white;padding:8px;border-radius:12px;box-shadow:0 2px 8px #0003}.panel input{flex:1;min-width:0;border:1px solid #ddd;border-radius:8px;padding:10px;font-size:14px}.panel button{border:0;border-radius:8px;background:#2c8b5b;color:white;padding:0 14px;font-weight:600}.hint{position:absolute;z-index:2;bottom:10px;left:10px;right:10px;background:white;padding:10px 12px;border-radius:10px;box-shadow:0 2px 8px #0003;color:#333;font-size:13px}.hint.error{color:#b42318}</style></head><body><div id="map"></div>
<div class="panel"><input id="search" placeholder="Search an address or place" autocomplete="street-address"/><button id="searchButton">Search</button></div><div id="hint" class="hint">Tap the map to place a pin, then confirm your address.</div>
<script>
let map, marker, geocoder, selected=null;
function send(value){const data=JSON.stringify(value);if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(data)}else if(window.parent!==window){window.parent.postMessage(data,'*')}}
function parts(r){var g=function(t){var c=(r.address_components||[]).find(function(a){return a.types.indexOf(t)>-1});return c?c.long_name:''};return{street:g('route'),locality:g('sublocality_level_1')||g('sublocality')||g('neighborhood'),city:g('locality')||g('administrative_area_level_2'),state:g('administrative_area_level_1'),pincode:g('postal_code')}}
function showHint(text,error){const el=document.getElementById('hint');el.textContent=text;el.className='hint'+(error?' error':'')}
function initMap(){map=new google.maps.Map(document.getElementById('map'),{center:${JSON.stringify(center)},zoom:${marker === "null" ? 5 : 16},mapTypeControl:false,streetViewControl:false,fullscreenControl:false,clickableIcons:false});geocoder=new google.maps.Geocoder();${marker !== "null" ? `marker=new google.maps.Marker({position:${marker},map});selected=marker.getPosition();reverseGeocode(selected);` : ""}
map.addListener('click',event=>{if(!event.latLng)return;selected=event.latLng;if(!marker)marker=new google.maps.Marker({map});marker.setPosition(selected);reverseGeocode(selected)});
document.getElementById('searchButton').onclick=()=>{const address=document.getElementById('search').value.trim();if(!address)return;geocoder.geocode({address},(results,status)=>{if(status==='OK'&&results[0]){map.setCenter(results[0].geometry.location);map.setZoom(16);selected=results[0].geometry.location;if(!marker)marker=new google.maps.Marker({map});marker.setPosition(selected);showHint(results[0].formatted_address,false);send(Object.assign({formattedAddress:results[0].formatted_address,latitude:selected.lat(),longitude:selected.lng()},parts(results[0])))}else showHint('Could not find that address. Try a nearby landmark.',true)})};
document.getElementById('search').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();document.getElementById('searchButton').click()}});
}
function reverseGeocode(position){geocoder.geocode({location:position},(results,status)=>{if(status==='OK'&&results[0]){showHint(results[0].formatted_address,false);send(Object.assign({formattedAddress:results[0].formatted_address,latitude:position.lat(),longitude:position.lng()},parts(results[0])))}else showHint('Pin selected. Enter the full delivery address in the app.',false)})}
window.initMap=initMap;
</script><script async src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=initMap" onerror="showHint('Google Maps could not load. Check the API key and enabled APIs.',true)"></script></body></html>`;
}

const styles = StyleSheet.create({
  webView: { height: 380, width: "100%", borderRadius: 14, overflow: "hidden", backgroundColor: Colors.light.surface },
  missingKey: { minHeight: 180, padding: 20, borderRadius: 14, backgroundColor: Colors.light.surface, justifyContent: "center", gap: 8 },
  missingTitle: { fontSize: 15, color: Colors.light.text, fontWeight: "600" },
  missingText: { fontSize: 13, color: Colors.light.textMuted, lineHeight: 19 },
});
