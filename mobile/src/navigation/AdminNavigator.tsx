import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AdminDashboardScreen } from "../screens/admin/AdminDashboardScreen";
import { AdminConsultationsListScreen } from "../screens/admin/AdminConsultationsListScreen";
import { AdminConsultationDetailScreen } from "../screens/admin/AdminConsultationDetailScreen";
import { AdminEditConsultationScreen } from "../screens/admin/AdminEditConsultationScreen";
import { AdminConsultationChatScreen } from "../screens/admin/AdminConsultationChatScreen";
import { AgentNavigator } from "./AgentNavigator";
import type { AdminStackParamList } from "./adminTypes";

const Stack = createNativeStackNavigator<AdminStackParamList>();

export function AdminNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminList" component={AdminDashboardScreen} />
      <Stack.Screen name="AdminConsultationsList" component={AdminConsultationsListScreen} />
      <Stack.Screen name="AdminConsultationDetail" component={AdminConsultationDetailScreen} />
      <Stack.Screen name="AdminEditConsultation" component={AdminEditConsultationScreen} />
      <Stack.Screen name="AdminConsultationChat" component={AdminConsultationChatScreen} />
      {/* Mode terrain imbriqué (voir AgentNavigator.tsx) — mêmes deux écrans que
          pour un compte de rôle "agent", accessibles ici en plus depuis
          l'accueil admin. */}
      <Stack.Screen name="AgentFlow" component={AgentNavigator} />
    </Stack.Navigator>
  );
}
