import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiBase, useAuth } from "@/context/auth";
import AddressMapPicker, { type PickedAddress } from "@/components/address-map-picker";

type SavedAddress = PickedAddress & { id: number; label: string; recipientName: string; phone: string; isDefault: boolean };

export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [label, setLabel] = useState("Home");
  const [formattedAddress, setFormattedAddress] = useState("");
  const [pin, setPin] = useState<PickedAddress | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const loadAddresses = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiBase()}/addresses`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Could not load your saved addresses");
      const data = await response.json();
      setAddresses(data.addresses || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load your addresses"); }
  }, [token]);

  useFocusEffect(useCallback(() => { void loadAddresses(); }, [loadAddresses]));

  const saveAddress = async () => {
    const value = formattedAddress.trim();
    if (value.length < 8) { setError("Choose a place on the map and confirm the address."); return; }
    if (!pin) { setError("Tap the map or search for a place to set the delivery pin."); return; }
    setIsLoading(true); setError("");
    try {
      const response = await fetch(`${getApiBase()}/addresses`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: label.trim() || "Home", recipientName: user?.name || "Customer", phone: user?.phone || "",
          formattedAddress: value, latitude: pin.latitude, longitude: pin.longitude, isDefault: addresses.length === 0 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save this address");
      setIsAdding(false); setLabel("Home"); setFormattedAddress(""); setPin(null);
      await loadAddresses();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save this address"); }
    finally { setIsLoading(false); }
  };

  const makeDefault = async (id: number) => {
    const response = await fetch(`${getApiBase()}/addresses/${id}/default`, { method: "PUT", headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) await loadAddresses();
    else setError("Could not update the default address");
  };

  const removeAddress = async (id: number) => {
    const response = await fetch(`${getApiBase()}/addresses/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) await loadAddresses();
    else setError("Could not delete this address");
  };

  const confirmRemove = (id: number) => {
    if (Platform.OS === "web") {
      if (window.confirm("Remove this saved address?")) void removeAddress(id);
    } else {
      Alert.alert("Remove address?", "This address will be deleted from your account.", [
        { text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => void removeAddress(id) },
      ]);
    }
  };

  const topPad = Platform.OS === "web" ? 18 : insets.top;
  return <View style={[styles.container, { paddingTop: topPad }]}>
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={20} color={Colors.light.text} /></Pressable>
      <Text style={styles.title}>Your Addresses</Text><View style={{ width: 42 }} />
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.intro}>Save delivery locations and choose the exact drop-off point on Google Maps.</Text>
      {!addresses.length && !isAdding ? <View style={styles.emptyCard}><Ionicons name="location-outline" size={26} color={Colors.light.tint} />
        <Text style={styles.emptyTitle}>No saved addresses</Text><Text style={styles.subtle}>Add a home or other delivery location.</Text></View> : null}
      {addresses.map(item => <View key={item.id} style={styles.addressCard}>
        <View style={styles.addressTop}><View style={styles.addressIcon}><Ionicons name="location" size={18} color={Colors.light.tint} /></View>
          <View style={{ flex: 1 }}><View style={styles.labelRow}><Text style={styles.label}>{item.label}</Text>{item.isDefault ? <Text style={styles.defaultTag}>DEFAULT</Text> : null}</View>
            <Text style={styles.subtle}>{item.recipientName} · {item.phone}</Text></View>
          <Pressable onPress={() => confirmRemove(item.id)} hitSlop={10}><Ionicons name="trash-outline" size={18} color={Colors.light.error} /></Pressable></View>
        <Text style={styles.addressText}>{item.formattedAddress}</Text>
        <Text style={styles.coordinates}>Pin: {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</Text>
        {!item.isDefault ? <Pressable onPress={() => void makeDefault(item.id)} style={styles.defaultButton}><Text style={styles.defaultButtonText}>Set as default</Text></Pressable> : null}
      </View>)}
      {isAdding ? <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Add delivery address</Text>
        <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="Label (Home, Work...)" />
        <TextInput style={[styles.input, styles.multiline]} value={formattedAddress} onChangeText={value => { setFormattedAddress(value); setPin(null); }} placeholder="Full delivery address" multiline />
        <AddressMapPicker initial={pin || undefined} onSelect={value => { setPin(value); setFormattedAddress(value.formattedAddress); setError(""); }} />
        {pin ? <Text style={styles.coordinates}>Selected pin: {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}><Pressable style={styles.cancelButton} onPress={() => { setIsAdding(false); setError(""); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          <Pressable style={[styles.saveButton, isLoading && { opacity: .6 }]} disabled={isLoading} onPress={() => void saveAddress()}>
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save address</Text>}</Pressable></View>
      </View> : <Pressable style={styles.addButton} onPress={() => { setIsAdding(true); setError(""); }}>
        <Ionicons name="add-circle-outline" size={20} color={Colors.light.tint} /><Text style={styles.addText}>Add a new address</Text></Pressable>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  backButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 19, fontWeight: "700", color: Colors.light.text },
  content: { padding: 16, paddingTop: 0, gap: 14, paddingBottom: 40 },
  intro: { color: Colors.light.textMuted, fontSize: 13, lineHeight: 20, marginBottom: 2 },
  emptyCard: { backgroundColor: "#fff", borderRadius: 16, padding: 22, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 15, color: Colors.light.text, fontWeight: "600" },
  addressCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.light.border },
  addressTop: { flexDirection: "row", gap: 10, alignItems: "center" },
  addressIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.light.tintLight, alignItems: "center", justifyContent: "center" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { color: Colors.light.text, fontSize: 15, fontWeight: "600" },
  defaultTag: { color: Colors.light.tint, fontSize: 9, fontWeight: "700", letterSpacing: .6 },
  subtle: { color: Colors.light.textMuted, fontSize: 12 },
  addressText: { color: Colors.light.textSecondary, fontSize: 13, lineHeight: 19 },
  coordinates: { color: Colors.light.textMuted, fontSize: 11 },
  defaultButton: { alignSelf: "flex-start", paddingVertical: 5 },
  defaultButtonText: { color: Colors.light.tint, fontSize: 13, fontWeight: "600" },
  addButton: { minHeight: 54, backgroundColor: "#fff", borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: Colors.light.border },
  addText: { color: Colors.light.tint, fontSize: 14, fontWeight: "600" },
  formCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: Colors.light.border },
  sectionTitle: { color: Colors.light.text, fontSize: 16, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, color: Colors.light.text, fontSize: 14 },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  error: { color: Colors.light.error, fontSize: 12 },
  actions: { flexDirection: "row", gap: 10 },
  cancelButton: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.surface },
  cancelText: { color: Colors.light.textSecondary, fontSize: 14, fontWeight: "600" },
  saveButton: { flex: 1.5, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.tint },
  saveText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
