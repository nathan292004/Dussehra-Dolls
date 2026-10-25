import React, { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { COUNTRIES, type Country } from "@/constants/countries";

interface Props {
  country: Country;
  onCountryChange: (country: Country) => void;
  value: string;
  onChangeText: (text: string) => void;
  autoFocus?: boolean;
}

/** Phone number box with a country selector on the left. India (+91) is the default. */
export default function PhoneInput({ country, onCountryChange, value, onChangeText, autoFocus }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <View style={styles.row}>
        <Pressable
          style={styles.countryBtn}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Country code ${country.dial}, ${country.name}. Tap to change`}
        >
          <Text style={styles.flag}>{country.flag}</Text>
          <Text style={styles.dial}>{country.dial}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.light.textMuted} />
        </Pressable>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(t) => onChangeText(t.replace(/[^\d\s-]/g, ""))}
          placeholder={country.placeholder}
          placeholderTextColor={Colors.light.textMuted}
          keyboardType="phone-pad"
          maxLength={country.max + 6}
          autoFocus={autoFocus}
        />
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select country</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={Colors.light.text} />
              </Pressable>
            </View>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(c) => c.code}
              renderItem={({ item }) => {
                const selected = item.code === country.code;
                return (
                  <Pressable
                    style={[styles.item, selected && styles.itemSelected]}
                    onPress={() => { onCountryChange(item); setOpen(false); }}
                  >
                    <Text style={styles.itemFlag}>{item.flag}</Text>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemDial}>{item.dial}</Text>
                    {selected ? <Ionicons name="checkmark" size={18} color={Colors.light.tint} /> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  countryBtn: {
    flexDirection: "row", alignItems: "center", gap: 5, paddingRight: 8,
    borderRightWidth: 1, borderRightColor: Colors.light.border, minHeight: 28,
  },
  flag: { fontSize: 18 },
  dial: { fontSize: 15, color: Colors.light.text, fontWeight: "600" },
  input: { flex: 1, fontSize: 15, color: Colors.light.text, paddingVertical: 0 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%", paddingBottom: 20 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18 },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: Colors.light.text },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  itemSelected: { backgroundColor: Colors.light.tintLight },
  itemFlag: { fontSize: 22 },
  itemName: { flex: 1, fontSize: 15, color: Colors.light.text },
  itemDial: { fontSize: 14, color: Colors.light.textSecondary, fontWeight: "600" },
});
