import React, { useCallback, useState } from "react";
import { RefreshControl } from "react-native";
import Colors from "@/constants/colors";

/**
 * Pull-to-refresh for a ScrollView / FlatList: `refreshControl={useRefreshControl(reload)}`.
 * `reload` is called when the user pulls down; the spinner stays until it finishes.
 */
export function useRefreshControl(reload: () => Promise<unknown> | unknown) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } catch {
      /* the screen shows its own errors */
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={Colors.light.tint}
      colors={[Colors.light.tint]}
    />
  );
}
