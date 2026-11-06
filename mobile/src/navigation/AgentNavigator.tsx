import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AgentNewConsultationStart } from "../screens/admin/AgentNewConsultationStart";
import { AgentSyncScreen } from "../screens/admin/AgentSyncScreen";
import { ConsultationNavigator } from "./ConsultationNavigator";
import type { AgentStackParamList } from "./agentTypes";

const Stack = createNativeStackNavigator<AgentStackParamList>();

// Navigateur du mode terrain, utilisé de deux façons (voir agentTypes.ts) :
// comme racine pour un compte de rôle "agent" (accès restreint), ou imbriqué dans
// AdminNavigator pour l'action rapide d'un administrateur. Toujours ces mêmes
// écrans, jamais plus — voir requireAdminRole côté backend pour le
// pendant serveur de cette restriction.
export function AgentNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AgentNewConsultationStart" component={AgentNewConsultationStart} />
      <Stack.Screen name="AgentConsultation" component={ConsultationNavigator} />
      <Stack.Screen name="AgentSync" component={AgentSyncScreen} />
    </Stack.Navigator>
  );
}
