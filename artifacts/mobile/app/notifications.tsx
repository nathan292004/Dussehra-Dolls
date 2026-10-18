import React, { useEffect, useState } from "react";
import { View, Text, Switch, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { getApiBase, useAuth } from "@/context/auth";

export default function NotificationsScreen() {
  const { token } = useAuth();
  const [orderUpdates, setOrderUpdates] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { fetch(`${getApiBase()}/whatsapp/preferences`, { headers: { Authorization: `Bearer ${token}` } })
    .then(response => response.json()).then(data => { setOrderUpdates(Boolean(data.orderUpdates)); setMarketing(Boolean(data.marketing)); })
    .catch(() => setMessage("Could not load choices"))
    .finally(() => setLoading(false)); }, [token]);
  const save = async () => {
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`${getApiBase()}/whatsapp/preferences`, { method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderUpdates, marketing }) });
      if (!response.ok) throw new Error("Could not save choices");
      setMessage("Your WhatsApp choices have been saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save choices"); }
    finally { setSaving(false); }
  };
  return <View style={styles.container}>
    <Pressable onPress={() => router.back()}><Text style={styles.link}>← Back</Text></Pressable>
    <Text style={styles.title}>WhatsApp notifications</Text>
    <Text style={styles.description}>Choose what we may send to your account phone number. You can change these choices any time.</Text>
    {loading ? <ActivityIndicator /> : <>
      <View style={styles.row}><View style={styles.label}><Text style={styles.heading}>Order and payment updates</Text><Text>Order confirmations, doll plan payments and reminders</Text></View><Switch value={orderUpdates} onValueChange={setOrderUpdates} /></View>
      <View style={styles.row}><View style={styles.label}><Text style={styles.heading}>Offers and promotions</Text><Text>Marketing messages and advertisements</Text></View><Switch value={marketing} onValueChange={setMarketing} /></View>
      <Pressable style={styles.button} onPress={save} disabled={saving}><Text style={styles.buttonText}>{saving ? "Saving…" : "Save choices"}</Text></Pressable>
    </>}
    {!!message && <Text style={styles.message}>{message}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 70, backgroundColor: Colors.light.background },
  link: { color: Colors.light.tint, marginBottom: 24 }, title: { fontSize: 24, fontWeight: "700", marginBottom: 12, color: Colors.light.text },
  description: { color: Colors.light.textMuted, lineHeight: 22, marginBottom: 24 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  label: { flex: 1, paddingRight: 12 }, heading: { fontWeight: "600", color: Colors.light.text, marginBottom: 4 },
  button: { backgroundColor: Colors.light.tint, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 28 },
  buttonText: { color: "white", fontWeight: "600" }, message: { marginTop: 18, color: Colors.light.text },
});
