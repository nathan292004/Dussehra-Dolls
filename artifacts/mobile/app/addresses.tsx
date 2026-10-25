import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiBase, useAuth } from "@/context/auth";
import AddressMapPicker, { type PickedAddress } from "@/components/address-map-picker";
import PhoneInput from "@/components/phone-input";
import { COUNTRIES, DEFAULT_COUNTRY, phoneProblem, toInternational, type Country } from "@/constants/countries";
import { useRefreshControl } from "@/hooks/use-refresh-control";

export type SavedAddress = {
  id: number;
  label: string;
  recipientName: string;
  phone: string;
  flatNumber?: string | null;
  building?: string | null;
  street?: string | null;
  locality?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  formattedAddress: string;
  addressLink?: string | null;
  latitude: number;
  longitude: number;
  isDefault: boolean;
};

interface FormState {
  label: string;
  recipientName: string;
  flatNumber: string;
  building: string;
  street: string;
  locality: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
}

const EMPTY: FormState = { label: "Home", recipientName: "", flatNumber: "", building: "", street: "", locality: "", landmark: "", city: "", state: "", pincode: "" };

/** "+919876543210" -> India and "9876543210". */
function splitPhone(full: string | null | undefined): { country: Country; national: string } {
  const digits = (full ?? "").replace(/\D/g, "");
  const match = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((c) => digits.startsWith(c.dial.slice(1)));
  return match ? { country: match, national: digits.slice(match.dial.length - 1) } : { country: DEFAULT_COUNTRY, national: digits };
}

export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState<PickedAddress | null>(null);
  // Where the map starts. Only set when editing, so picking a spot does not reload the map.
  const [startPin, setStartPin] = useState<PickedAddress | undefined>(undefined);
  const [editingId, setEditingId] = useState<number | null>(null);
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
  const refreshControl = useRefreshControl(loadAddresses);

  const set = (key: keyof FormState) => (value: string) => { setForm((f) => ({ ...f, [key]: value })); setError(""); };

  const openNew = () => {
    const mine = splitPhone(user?.phone);
    setForm({ ...EMPTY, recipientName: user?.name ?? "" });
    setCountry(mine.country);
    setPhone(mine.national);
    setPin(null);
    setStartPin(undefined);
    setEditingId(null);
    setIsAdding(true);
    setError("");
  };

  const openEdit = (a: SavedAddress) => {
    const mine = splitPhone(a.phone);
    setForm({
      label: a.label, recipientName: a.recipientName, flatNumber: a.flatNumber ?? "", building: a.building ?? "", street: a.street ?? "",
      locality: a.locality ?? "", landmark: a.landmark ?? "", city: a.city ?? "", state: a.state ?? "", pincode: a.pincode ?? "",
    });
    setCountry(mine.country);
    setPhone(mine.national);
    const existing = { formattedAddress: a.formattedAddress, latitude: a.latitude, longitude: a.longitude };
    setPin(existing);
    setStartPin(existing);
    setEditingId(a.id);
    setIsAdding(true);
    setError("");
  };

  // When a place is picked on the map, fill the area fields that the customer has not typed yet.
  const onPick = useCallback((picked: PickedAddress) => {
    setPin(picked);
    setForm((f) => ({
      ...f,
      street: f.street || picked.street || "",
      locality: f.locality || picked.locality || "",
      city: f.city || picked.city || "",
      state: f.state || picked.state || "",
      pincode: f.pincode || picked.pincode || "",
    }));
    setError("");
  }, []);

  const validate = (): string | null => {
    if (form.recipientName.trim().length < 2) return "Enter the name of the person receiving the delivery";
    const phoneErr = phoneProblem(country, phone);
    if (phoneErr) return phoneErr;
    if (!form.flatNumber.trim()) return "Enter your flat / house number";
    if (form.locality.trim().length < 2) return "Enter your locality or area";
    if (form.city.trim().length < 2) return "Enter your city";
    if (form.state.trim().length < 2) return "Enter your state";
    const intl = toInternational(country, phone);
    if (intl.startsWith("+91") ? !/^\d{6}$/.test(form.pincode.trim()) : form.pincode.trim().length < 3) return "Enter a valid pincode (6 digits in India)";
    if (!pin) return "Tap the map or search for a place to set the delivery pin";
    return null;
  };

  const saveAddress = async () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setIsLoading(true); setError("");
    try {
      const url = editingId ? `${getApiBase()}/addresses/${editingId}` : `${getApiBase()}/addresses`;
      const response = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          label: form.label.trim() || "Home",
          recipientName: form.recipientName.trim(),
          phone: toInternational(country, phone),
          flatNumber: form.flatNumber.trim(),
          building: form.building.trim(),
          street: form.street.trim(),
          locality: form.locality.trim(),
          landmark: form.landmark.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          pincode: form.pincode.trim(),
          latitude: pin!.latitude,
          longitude: pin!.longitude,
          ...(addresses.length === 0 ? { isDefault: true } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save this address");
      setIsAdding(false); setEditingId(null); setForm(EMPTY); setPin(null);
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

  const field = (label: string, key: keyof FormState, placeholder: string, opts: { required?: boolean; keyboard?: "default" | "number-pad"; max?: number } = {}) => (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}{opts.required ? " *" : ""}</Text>
      <TextInput
        style={styles.input}
        value={form[key]}
        onChangeText={set(key)}
        placeholder={placeholder}
        placeholderTextColor={Colors.light.textMuted}
        keyboardType={opts.keyboard ?? "default"}
        maxLength={opts.max ?? 120}
      />
    </View>
  );

  const topPad = Platform.OS === "web" ? 18 : insets.top;
  return <View style={[styles.container, { paddingTop: topPad }]}>
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={20} color={Colors.light.text} /></Pressable>
      <Text style={styles.title}>Your Addresses</Text><View style={{ width: 42 }} />
    </View>
    <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>Save delivery addresses with your flat number, locality and exact pin on Google Maps, so the courier can find you.</Text>
      {!addresses.length && !isAdding ? <View style={styles.emptyCard}><Ionicons name="location-outline" size={26} color={Colors.light.tint} />
        <Text style={styles.emptyTitle}>No saved addresses</Text><Text style={styles.subtle}>Add a home or other delivery location.</Text></View> : null}
      {addresses.map(item => <View key={item.id} style={styles.addressCard}>
        <View style={styles.addressTop}><View style={styles.addressIcon}><Ionicons name="location" size={18} color={Colors.light.tint} /></View>
          <View style={{ flex: 1 }}><View style={styles.labelRow}><Text style={styles.label}>{item.label}</Text>{item.isDefault ? <Text style={styles.defaultTag}>DEFAULT</Text> : null}</View>
            <Text style={styles.subtle}>{item.recipientName} · {item.phone}</Text></View>
          <Pressable onPress={() => openEdit(item)} hitSlop={10} style={{ marginRight: 12 }}><Ionicons name="create-outline" size={18} color={Colors.light.textSecondary} /></Pressable>
          <Pressable onPress={() => confirmRemove(item.id)} hitSlop={10}><Ionicons name="trash-outline" size={18} color={Colors.light.error} /></Pressable></View>
        <Text style={styles.addressText}>{item.formattedAddress}</Text>
        <View style={styles.linkRow}>
          {item.addressLink ? <Pressable onPress={() => void Linking.openURL(item.addressLink!)} style={styles.mapLink}>
            <Ionicons name="map-outline" size={14} color={Colors.light.tint} /><Text style={styles.mapLinkText}>View on Google Maps</Text></Pressable> : null}
          {!item.isDefault ? <Pressable onPress={() => void makeDefault(item.id)} style={styles.defaultButton}><Text style={styles.defaultButtonText}>Set as default</Text></Pressable> : null}
        </View>
      </View>)}
      {isAdding ? <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>{editingId ? "Edit address" : "Add delivery address"}</Text>
        {field("Save as", "label", "Home, Work, Parents...", { max: 40 })}
        {field("Receiver name", "recipientName", "Who will receive the parcel", { required: true, max: 100 })}
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Receiver phone *</Text>
          <View style={styles.phoneBox}><PhoneInput country={country} onCountryChange={setCountry} value={phone} onChangeText={(v) => { setPhone(v); setError(""); }} /></View>
        </View>

        <Text style={styles.stepTitle}>1. Choose the location on the map</Text>
        <AddressMapPicker initial={startPin} onSelect={onPick} />
        {pin ? <View style={styles.pinRow}><Ionicons name="checkmark-circle" size={16} color={Colors.light.tint} />
          <Text style={styles.coordinates} numberOfLines={2}>Pin set · {pin.formattedAddress}</Text></View> : null}

        <Text style={styles.stepTitle}>2. Complete the address</Text>
        {field("Flat / house number", "flatNumber", "e.g. 12B, Floor 3", { required: true, max: 60 })}
        {field("Building / apartment name", "building", "e.g. Lotus Apartments", { max: 100 })}
        {field("Street / road", "street", "e.g. MG Road", { max: 120 })}
        {field("Locality / area", "locality", "e.g. Indiranagar", { required: true, max: 100 })}
        {field("Landmark", "landmark", "e.g. Near City Hospital", { max: 100 })}
        <View style={styles.twoCols}>
          <View style={{ flex: 1 }}>{field("City", "city", "City", { required: true, max: 80 })}</View>
          <View style={{ flex: 1 }}>{field("Pincode", "pincode", "560038", { required: true, keyboard: "number-pad", max: 10 })}</View>
        </View>
        {field("State", "state", "State", { required: true, max: 80 })}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}><Pressable style={styles.cancelButton} onPress={() => { setIsAdding(false); setEditingId(null); setError(""); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          <Pressable style={[styles.saveButton, isLoading && { opacity: .6 }]} disabled={isLoading} onPress={() => void saveAddress()}>
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save address</Text>}</Pressable></View>
      </View> : <>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.addButton} onPress={openNew}>
          <Ionicons name="add-circle-outline" size={20} color={Colors.light.tint} /><Text style={styles.addText}>Add a new address</Text></Pressable>
      </>}
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
  coordinates: { color: Colors.light.textSecondary, fontSize: 12, flex: 1 },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  mapLink: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 5 },
  mapLinkText: { color: Colors.light.tint, fontSize: 13, fontWeight: "600" },
  defaultButton: { paddingVertical: 5 },
  defaultButtonText: { color: Colors.light.tint, fontSize: 13, fontWeight: "600" },
  addButton: { minHeight: 54, backgroundColor: "#fff", borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: Colors.light.border },
  addText: { color: Colors.light.tint, fontSize: 14, fontWeight: "600" },
  formCard: { backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: Colors.light.border },
  sectionTitle: { color: Colors.light.text, fontSize: 16, fontWeight: "600" },
  stepTitle: { color: Colors.light.text, fontSize: 14, fontWeight: "700", marginTop: 6 },
  fieldBlock: { gap: 5 },
  fieldLabel: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, color: Colors.light.text, fontSize: 14 },
  phoneBox: { borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, flexDirection: "row" },
  twoCols: { flexDirection: "row", gap: 10 },
  pinRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  error: { color: Colors.light.error, fontSize: 12 },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelButton: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.surface },
  cancelText: { color: Colors.light.textSecondary, fontSize: 14, fontWeight: "600" },
  saveButton: { flex: 1.5, minHeight: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.tint },
  saveText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
